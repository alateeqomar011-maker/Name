"""Vendored inference code of kNN-VC (Baas, van Niekerk & Kamper, Interspeech 2023).

Source: https://github.com/bshall/knn-vc (MIT, see LICENSE). WavLM code is from
https://github.com/microsoft/unilm (MIT). Only the model definitions are vendored; the matching and
vocoding logic lives in murattil/voice/neural.py. Weights are downloaded by scripts/fetch_models.py.
"""
