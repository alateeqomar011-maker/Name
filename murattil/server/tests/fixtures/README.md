# Test audio fixtures

Short LibriSpeech utterances (CC BY 4.0, https://www.openslr.org/12), redistributed via the
librosa example-data repository (https://github.com/librosa/data):

| file | LibriSpeech id | reader |
| --- | --- | --- |
| speaker_a.ogg | 3436-172162-0000 | Anders Lankford |
| speaker_b.ogg | 5703-47212-0000 | Garth Comira |
| speaker_c.ogg | 198-209-0000 | Heather Barnett |

They are English speech, not Quran recitation. They are used to test the audio pipeline (analysis,
alignment, style transfer, speaker identity) on real human voices; they say nothing about Tajweed
accuracy.

## Synthetic Arabic

| file | content |
| --- | --- |
| synthetic_fatiha_1_5.flac | Al-Fatihah 1–5, synthesised with eSpeak NG (Arabic voice) |
| synthetic_fatiha_1_5_missing_word.flac | the same with «نَعۡبُدُ» (1:5, word 2) deliberately left out |

They are stored losslessly (FLAC): lossy compression changes what a recogniser hears in robotic
speech. eSpeak NG is a formant synthesiser: this is robotic speech, not recitation, and it mispronounces
some words. The clips exist to exercise the real Quran recogniser end to end (model I/O, alignment,
missed-word detection) where no recitation audio is available. They are not evidence of accuracy
on human recitation.
