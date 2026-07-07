# @audio/weighting

> Frequency weighting filters — time-domain SOS implementations with `.coefs(fs)` for analysis.

| Package | What |
|---|---|
| `@audio/weighting-a` | IEC 61672 A-weighting |
| `@audio/weighting-c` | IEC 61672 C-weighting |
| `@audio/weighting-k` | ITU-R BS.1770-4 K-weighting (exact at any sample rate) |
| `@audio/weighting-itu468` | ITU-R BS.468-4 noise weighting |
| `@audio/weighting-riaa` | RIAA playback equalization |

Extracted from [audio-filter](https://github.com/audiojs/audio-filter). Magnitude-response *functions* (not filters) live in [a-weighting](https://github.com/audiojs/a-weighting) — absorb later as `.response(f)` per atom.
