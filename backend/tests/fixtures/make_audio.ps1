Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)

$synth.SetOutputToWaveFile("backend\tests\fixtures\q1_java.wav", $format)
$synth.Speak("What is Java programming?")

$synth.SetOutputToWaveFile("backend\tests\fixtures\q2_sql.wav", $format)
$synth.Speak("What is the difference between SQL and NoSQL?")

$synth.SetOutputToWaveFile("backend\tests\fixtures\q3_ai.wav", $format)
$synth.Speak("Explain artificial intelligence in simple terms.")

$synth.Dispose()
