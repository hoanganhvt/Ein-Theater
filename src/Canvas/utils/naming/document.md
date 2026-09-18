# Model and layer naming

Pure Go string transformations; no state, IO or HTTP dependencies.

| Component (`naming.go`) | Input | Output |
| --- | --- | --- |
| `IsValidModelFolderName` | Arbitrary string | Boolean: first byte is an ASCII letter, remaining bytes are letters/digits/underscore, and the name is nonempty. |
| `FixModelName` | Arbitrary model name | Valid identifier. Trims surrounding whitespace, replaces spaces and invalid bytes with underscores, adds `model_` when necessary; empty input becomes `model`. |
| `LayerTypeToPrefix` | Layer type such as `nn.Linear`, `torch.relu`, `nn.Conv2d` | Lowercase alphanumeric node-ID prefix. Special cases: conv2d → conv, batchnorm2d → batchnorm, maxpool2d → maxpool. Empty result becomes `block`. |

Names are ASCII-oriented and retain the existing byte-based normalization.
Normalization does not create a directory or verify filesystem availability.

From `src`, run `go test ./Canvas/utils/naming -v`. `TestFixModelName` checks exact
normalizations, including numeric prefixes and blank names, and verifies that
every result passes validation. Expected result: PASS.
