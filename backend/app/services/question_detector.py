import re
import json
import logging
from typing import List, Optional
from app.schemas.schemas import QuestionItem, QuestionDetectionResult
from app.services.ai_providers import get_ai_provider

logger = logging.getLogger("echomind.question_detector")

QUESTION_SYSTEM_PROMPT = """You are an expert conversation analyst.
Your task is to analyze conversation transcripts and identify all questions asked by the participants.

Instructions:
1. Identify all DIRECT questions (e.g., "What is the difference between auth and authz?", "How do we scale this?")
2. Identify all INDIRECT questions (e.g., "I wonder if we should use Redis", "Could you tell me how this works?")
3. Extract MULTIPLE questions if more than one question was asked.
4. PRESERVE the speaker's original wording as closely as possible.
5. If NO question was asked, return an empty array `[]`. DO NOT invent or assume questions.
6. Deduplicate identical or semantically identical questions in the same snippet.
7. Provide a concise `context_snippet` (1-2 sentences) showing why or where the question arose.

You MUST respond strictly with valid JSON conforming to this format:
{
  "questions": [
    {
      "question_text": "Exact text of the question?",
      "context_snippet": "Relevant context or preceding sentence.",
      "question_index": 1
    }
  ]
}
"""


def heuristic_question_extractor(transcript_text: str) -> List[QuestionItem]:
    """
    High-accuracy heuristic fallback extractor when AI provider API keys
    are not set or network is unreachable. Ensures zero downtime.
    """
    results: List[QuestionItem] = []
    seen = set()

    # Split into candidate sentences
    sentences = re.split(r'(?<=[.?!])\s+', transcript_text.strip())
    
    question_starters = (
        "what", "why", "how", "when", "where", "who", "which", "whose", "whom",
        "can", "could", "would", "should", "is", "are", "do", "does", "did",
        "has", "have", "had", "will", "shall", "may", "might", "wondering if",
        "tell me", "explain"
    )

    idx = 1
    for i, s in enumerate(sentences):
        clean_s = s.strip()
        if not clean_s or len(clean_s) < 5:
            continue

        lower = clean_s.lower().rstrip(".,?!")
        is_q = False

        if clean_s.endswith("?"):
            is_q = True
        elif any(lower.startswith(starter + " ") or lower.startswith(starter + "'") for starter in question_starters):
            # Check if it has a question shape
            is_q = True

        if is_q:
            # Clean up and normalize
            q_text = clean_s
            if not q_text.endswith("?"):
                q_text += "?"
            
            normalized = q_text.lower().strip()
            if normalized not in seen:
                seen.add(normalized)
                context = sentences[i - 1].strip() if i > 0 else clean_s
                results.append(QuestionItem(
                    question_text=q_text,
                    context_snippet=context,
                    question_index=idx
                ))
                idx += 1

    return results


async def detect_questions_from_transcript(
    transcript_text: str,
    provider_name: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None
) -> QuestionDetectionResult:
    if not transcript_text or not transcript_text.strip():
        return QuestionDetectionResult(questions=[], processed_segment_count=0, message="Empty transcript")

    clean_text = transcript_text.strip()

    # Attempt AI detection first if provider key is available
    provider = get_ai_provider(provider_name=provider_name, api_key=api_key)
    
    if provider.api_key:
        try:
            target_model = model or "meta-llama/llama-3.1-8b-instruct"
            messages = [
                {"role": "system", "content": QUESTION_SYSTEM_PROMPT},
                {"role": "user", "content": f"Analyze this conversation segment:\n\n{clean_text}"}
            ]

            raw_response = await provider.generate_chat_completion(
                messages=messages,
                model=target_model,
                temperature=0.1,
                max_tokens=800
            )

            # Strip markdown code blocks if model wrapped JSON
            cleaned_response = raw_response.strip()
            if cleaned_response.startswith("```"):
                cleaned_response = re.sub(r"^```(?:json)?\n?", "", cleaned_response)
                cleaned_response = re.sub(r"\n?```$", "", cleaned_response)

            data = json.loads(cleaned_response)
            questions_data = data.get("questions", [])
            parsed_questions = [QuestionItem(**q) for q in questions_data]
            
            return QuestionDetectionResult(
                questions=parsed_questions,
                processed_segment_count=len(parsed_questions),
                message="Questions detected via open-weight AI model"
            )
        except Exception as e:
            logger.warning(f"AI question detection failed, falling back to heuristic: {e}")

    # Heuristic fallback (fast, local, reliable)
    questions = heuristic_question_extractor(clean_text)
    return QuestionDetectionResult(
        questions=questions,
        processed_segment_count=len(questions),
        message="Questions detected via heuristic engine (configure API key for LLM precision)"
    )
