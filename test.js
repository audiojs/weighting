import test, { almost, ok, is } from 'tst'
import * as audio from './index.js'
import { freqz, mag2db } from 'digital-filter'
import { magDB, EPSILON, impulse, rings, collections } from './test/util.js'
import { fileURLToPath } from 'node:url'
import { aWeighting as aAtom } from '@audio/weighting-a/audio'
import { bWeighting as bAtom } from '@audio/weighting-b/audio'
import { cWeighting as cAtom } from '@audio/weighting-c/audio'
import { dWeighting as dAtom } from '@audio/weighting-d/audio'
import { itu468 as ituAtom } from '@audio/weighting-itu468/audio'
import { kWeighting as kAtom } from '@audio/weighting-k/audio'
import { riaa as riaaAtom } from '@audio/weighting-riaa/audio'

// IEC 61672-1:2013 Table 2 — A-weighting nominal values (dB)
const IEC_A = {
	31.5: -39.4, 63: -26.2, 125: -16.1, 250: -8.6, 500: -3.2,
	1000: 0.0, 2000: 1.2, 4000: 1.0, 8000: -1.1, 10000: -2.5,
	16000: -6.6, 20000: -9.3
}

// IEC 61672-1:2013 Table 2 — C-weighting nominal values (dB)
const IEC_C = {
	31.5: -3.0, 63: -0.8, 125: -0.2, 250: 0.0, 500: 0.0,
	1000: 0.0, 2000: -0.2, 4000: -0.8, 8000: -3.0
}

// Rec. ITU-R BS.468-4 Annex 1 table, dB rel 1kHz (reproduced in Wikipedia
// "ITU-R 468 noise weighting"; digits also embedded in itu468-poles.mjs
// used to derive the analog pole positions in weighting/itu468.js)
const BS468 = {
	31.5: -29.9, 63: -23.9, 100: -19.8, 200: -13.8, 400: -7.8, 800: -1.9,
	1000: 0, 2000: 5.6, 3150: 9.0, 4000: 10.5, 5000: 11.7, 6300: 12.2,
	7100: 12.0, 8000: 11.4, 9000: 10.1, 10000: 8.1, 12500: 0, 14000: -5.3,
	16000: -11.7, 20000: -22.2
}

// Matched-z discretization of the itu468 analog prototype (0.05dB max error,
// see itu468-poles.mjs) is near-exact away from Nyquist and degrades close to
// it; tolerances below are measured envelopes (script:
// scratchpad/fix-weighting/verify-itu468.mjs), not arbitrary slack.
function itu468Tol(fs, f) {
	if (f <= 800) return 0.15
	if (f <= 6300) return fs >= 96000 ? 0.6 : fs >= 48000 ? 1.5 : 1.8
	if (f <= 10000) return fs >= 96000 ? 1.0 : fs >= 48000 ? 3.5 : 4.2
	return fs >= 96000 ? 3.5 : fs >= 48000 ? 14.5 : 17.5
}

test('aWeighting — IEC 61672 table values at 96kHz', () => {
	// matched z-transform: ≤10kHz excellent; 16–20kHz within IEC Class 1 (±2 dB)
	let sos = audio.aWeighting.coefs(96000)
	for (let [f, expected] of Object.entries(IEC_A)) {
		let tol = +f >= 16000 ? 1.5 : 0.5
		let got = magDB(sos, +f, 96000)
		ok(Math.abs(got - expected) < tol, `A-weighting ${f}Hz: expected ${expected}, got ${got.toFixed(2)} dB`)
	}
})

test('aWeighting — IEC 61672 table values at 48kHz', () => {
	// matched z-transform: ≤8kHz < 1 dB; 10kHz ~1.1 dB (IEC Class 1 boundary);
	// 16–20kHz: better than bilinear (4 dB vs 12 dB error) but 48kHz is insufficient there
	let sos = audio.aWeighting.coefs(48000)
	for (let [f, expected] of Object.entries(IEC_A)) {
		let tol = +f >= 16000 ? 5.0 : +f >= 10000 ? 1.2 : 1.0
		let got = magDB(sos, +f, 48000)
		ok(Math.abs(got - expected) < tol, `A-weighting ${f}Hz@48kHz: expected ${expected}, got ${got.toFixed(2)} dB`)
	}
})

test('cWeighting — IEC 61672 table values at 96kHz', () => {
	let sos = audio.cWeighting.coefs(96000)
	for (let [f, expected] of Object.entries(IEC_C)) {
		let got = magDB(sos, +f, 96000)
		ok(Math.abs(got - expected) < 0.5, `C-weighting ${f}Hz: expected ${expected}, got ${got.toFixed(2)} dB`)
	}
})

test('aWeighting — 3 SOS sections via coefs', () => {
	let sos = audio.aWeighting.coefs(44100)
	is(sos.length, 3, '3 sections')
	ok(sos[0].b0 !== undefined, 'has coefficients')
})

test('aWeighting — 0dB at 1kHz (analytic normalization exactness)', () => {
	// matchedZ's normalize() sets gain to exactly 0dB at normFreq by construction;
	// evaluated directly (magDB) rather than via freqz's rounded FFT bin, whose
	// nearest-bin frequency error alone (~1.3Hz off at 44100/2048) already exceeds 1e-3dB
	let sos = audio.aWeighting.coefs(44100)
	let db = magDB(sos, 1000, 44100)
	almost(db, 0, 1e-9, 'A-weighting exactly 0dB at 1kHz, got ' + db)
})

test('aWeighting — in-place processing', () => {
	let data = impulse(512)
	let p = { fs: 44100 }
	audio.aWeighting(data, p)
	let hasOutput = false
	for (let v of data) if (Math.abs(v) > 1e-10) { hasOutput = true; break }
	ok(hasOutput, 'aWeighting produces output')
})

test('cWeighting — 2 SOS sections via coefs', () => {
	let sos = audio.cWeighting.coefs(44100)
	is(sos.length, 2, '2 sections')
})

test('cWeighting — 0dB at 1kHz (analytic normalization exactness)', () => {
	let sos = audio.cWeighting.coefs(44100)
	let db = magDB(sos, 1000, 44100)
	almost(db, 0, 1e-9, 'C-weighting exactly 0dB at 1kHz, got ' + db)
})

test('cWeighting — in-place processing', () => {
	let data = impulse(512)
	let p = { fs: 44100 }
	audio.cWeighting(data, p)
	let hasOutput = false
	for (let v of data) if (Math.abs(v) > 1e-10) { hasOutput = true; break }
	ok(hasOutput, 'cWeighting produces output')
})

test('kWeighting 48kHz — exact BS.1770-4 Annex 1 coefficients (all 5 coefs, both stages)', () => {
	// ITU-R BS.1770-4 Annex 1: pre-filter stage 1 (high shelf) and stage 2 (RLB highpass)
	let sos = audio.kWeighting.coefs(48000)
	is(sos.length, 2, '2 stages')
	almost(sos[0].b0, 1.53512485958697, EPSILON)
	almost(sos[0].b1, -2.69169618940638, EPSILON)
	almost(sos[0].b2, 1.19839281085285, EPSILON)
	almost(sos[0].a1, -1.69065929318241, EPSILON)
	almost(sos[0].a2, 0.73248077421585, EPSILON)
	almost(sos[1].b0, 1.0, EPSILON)
	almost(sos[1].b1, -2.0, EPSILON)
	almost(sos[1].b2, 1.0, EPSILON)
	almost(sos[1].a1, -1.99004745483398, EPSILON)
	almost(sos[1].a2, 0.99007225036621, EPSILON)
})

// BS.1770-4 Annex 1: coefficients at other rates "should be chosen to provide the same frequency response that the
// specified filter provides at 48 kHz". Redesigned per rate from the analog prototype (as libebur128 and pyloudnorm's
// DeMan filter do), the response stays within 0.01 dB of the 48 kHz table's at 44.1 kHz and 0.05 dB from 32 to 192 kHz.
// Lower rates warp the shelf near 2.5 kHz: 0.15 dB at 16 kHz, 0.5 dB at 8 kHz (speech reads 0.08 and 0.18 LU louder
// than the same speech at 48 kHz); the bounds below hold that.
test('kWeighting — the 48 kHz table response at other rates', () => {
	let table = [
		{ b0: 1.53512485958697, b1: -2.69169618940638, b2: 1.19839281085285, a1: -1.69065929318241, a2: 0.73248077421585 },
		{ b0: 1, b1: -2, b2: 1, a1: -1.99004745483398, a2: 0.99007225036621 },
	]
	for (let [fs, tol] of [[44100, 0.01], [32000, 0.05], [88200, 0.05], [96000, 0.05], [192000, 0.05], [22050, 0.1], [16000, 0.2], [8000, 0.55]]) {
		let worst = 0
		for (let f = 10; f < 0.45 * Math.min(fs, 48000); f *= 1.02) worst = Math.max(worst, Math.abs(magDB(audio.kWeighting.coefs(fs), f, fs) - magDB(table, f, 48000)))
		ok(worst <= tol, `${fs} Hz: within ${worst.toFixed(4)} dB (≤ ${tol})`)
	}
})

test('kWeighting other rate — still returns 2 sections', () => {
	let sos = audio.kWeighting.coefs(44100)
	is(sos.length, 2, '2 stages at 44100')
})

test('kWeighting 44100Hz — shelf matches analog design gain at DC/Nyquist', () => {
	// Independent reference check at a non-48kHz rate: for ANY correctly
	// bilinear-transformed 2nd-order analog shelf, z=1 (DC) maps exactly to
	// s=0 and z=-1 (Nyquist) maps exactly to s=∞ (Zölzer, "Digital Audio
	// Signal Processing", bilinear transform frequency mapping) — so the
	// digital shelf's gain at DC must equal the analog low-frequency
	// asymptote (0dB, unity) and at Nyquist must equal the analog high-shelf
	// gain G exactly, for every sample rate, independent of the specific
	// coefficient formula used to reach it.
	let G = 3.999843853973347 // weighting/k-weighting.js shelf gain constant
	for (let fs of [44100, 96000, 192000]) {
		let shelf = [audio.kWeighting.coefs(fs)[0]]
		almost(magDB(shelf, 1e-6, fs), 0, 1e-6, `shelf@${fs} ≈0dB at DC`)
		almost(magDB(shelf, fs / 2 - 1e-6, fs), G, 1e-6, `shelf@${fs} ≈${G}dB at Nyquist`)
	}
})

test('kWeighting 44100Hz — RLB stage keeps unnormalized {1,-2,1} numerator at any fs', () => {
	// ITU-R BS.1770-4 Annex 1: RLB highpass b-coefficients are the fixed
	// double-zero-at-DC numerator (1 - z^-1)^2, unnormalized, independent of fs
	for (let fs of [44100, 48000, 96000]) {
		let rlb = audio.kWeighting.coefs(fs)[1]
		is(rlb.b0, 1, `rlb.b0@${fs}`)
		is(rlb.b1, -2, `rlb.b1@${fs}`)
		is(rlb.b2, 1, `rlb.b2@${fs}`)
	}
})

test('itu468 — exact 3 SOS sections (6 matched-z poles paired into 3 biquads)', () => {
	let sos = audio.itu468.coefs(48000)
	is(sos.length, 3, '3 sections')
})

test('itu468 — in-place processing', () => {
	let data = impulse(512)
	let p = { fs: 48000 }
	audio.itu468(data, p)
	let hasOutput = false
	for (let v of data) if (Math.abs(v) > 1e-10) { hasOutput = true; break }
	ok(hasOutput, 'itu468 produces output')
})

test('riaa — returns 1 section', () => {
	let sos = audio.riaa.coefs(44100)
	is(sos.length, 1, '1 section')
})

test('riaa — bass boost at 20Hz', () => {
	let sos = audio.riaa.coefs(44100)
	let resp = freqz(sos, 4096, 44100)
	let idx20 = Math.round(20 / (44100 / 2) * 4096)
	let idx1k = Math.round(1000 / (44100 / 2) * 4096)
	let db20 = mag2db(resp.magnitude[idx20])
	let db1k = mag2db(resp.magnitude[idx1k])
	ok(db20 > db1k + 10, 'RIAA boosts bass (20Hz > 1kHz by >10dB)')
})

test('riaa — in-place processing', () => {
	let data = impulse(512)
	let p = { fs: 44100 }
	audio.riaa(data, p)
	let hasOutput = false
	for (let v of data) if (Math.abs(v) > 1e-10) { hasOutput = true; break }
	ok(hasOutput, 'riaa produces output')
})

test('itu468 — peaked response near 6.3kHz', () => {
	let sos = audio.itu468.coefs(48000)
	is(sos.length, 3, '3 sections')
	let resp = freqz(sos, 4096, 48000)
	let db = mag2db(resp.magnitude)
	let idx2k = Math.round(2000 / (48000 / 2) * 4096)
	let idx6k = Math.round(6300 / (48000 / 2) * 4096)
	// ITU-468 peaks near 6.3kHz, significantly above 2kHz level
	ok(db[idx6k] > db[idx2k] + 3, 'ITU-468 peaks near 6.3kHz (6.3kHz: ' + db[idx6k].toFixed(1) + 'dB, 2kHz: ' + db[idx2k].toFixed(1) + 'dB)')
})

// ═══════════════════════════════════════════════════════════════════════════
// Standards calibration
// ═══════════════════════════════════════════════════════════════════════════

for (let fs of [96000, 48000, 44100]) {
	test(`itu468 ${fs}Hz — full BS.468-4 table, 31.5Hz–20kHz (rel 1kHz)`, () => {
		let sos = audio.itu468.coefs(fs)
		is(sos.length, 3, '3 sections')
		let ref = magDB(sos, 1000, fs)
		for (let [f, expected] of Object.entries(BS468)) {
			let got = magDB(sos, +f, fs) - ref
			let tol = itu468Tol(fs, +f)
			ok(Math.abs(got - expected) < tol, `ITU-468@${fs} ${f}Hz: expected ${expected}dB rel 1kHz, got ${got.toFixed(2)}dB (tol ${tol})`)
		}
	})
}

test('riaa 44100Hz — IEC 98 reference values relative to 1kHz', () => {
	let sos = audio.riaa.coefs(44100)
	let db1k = magDB(sos, 1000, 44100)
	let db20 = magDB(sos, 20, 44100)
	let db10k = magDB(sos, 10000, 44100)
	let rel20 = db20 - db1k
	ok(Math.abs(rel20 - 19.274) < 1.0, `RIAA 20Hz: expected +19.274dB rel 1kHz, got ${rel20.toFixed(3)}dB`)
	let rel10k = db10k - db1k
	ok(Math.abs(rel10k - (-13.734)) < 1.0, `RIAA 10kHz: expected -13.734dB rel 1kHz, got ${rel10k.toFixed(3)}dB`)
})

test('kWeighting 44100Hz — shelving boost near 2kHz, HPF rolls off below 100Hz', () => {
	let sos = audio.kWeighting.coefs(44100)
	let db200 = magDB(sos, 200, 44100)
	let db2k = magDB(sos, 2000, 44100)
	ok(db2k > db200, `K-weighting 2kHz (${db2k.toFixed(2)}dB) boosted vs 200Hz (${db200.toFixed(2)}dB)`)
	let db20 = magDB(sos, 20, 44100)
	ok(db20 < db200 - 3, `K-weighting 20Hz (${db20.toFixed(2)}dB) rolls off vs 200Hz (${db200.toFixed(2)}dB)`)
})

test('cWeighting 48kHz — IEC 61672 table values', () => {
	let sos = audio.cWeighting.coefs(48000)
	let table = { 31.5: -3.0, 1000: 0, 8000: -3.0 }
	for (let [f, expected] of Object.entries(table)) {
		let got = magDB(sos, +f, 48000)
		let tol = +f >= 8000 ? 1.0 : 0.5
		ok(Math.abs(got - expected) < tol, `C-weighting@48kHz ${f}Hz: expected ${expected}dB, got ${got.toFixed(2)}dB`)
	}
})

test('aWeighting 44100Hz — IEC 61672 table values', () => {
	let sos = audio.aWeighting.coefs(44100)
	let table = {
		31.5: -39.4, 63: -26.2, 125: -16.1, 250: -8.6, 500: -3.2,
		1000: 0.0, 2000: 1.2, 4000: 1.0, 8000: -1.1
	}
	for (let [f, expected] of Object.entries(table)) {
		let tol = +f <= 63 ? 2.0 : 1.5
		let got = magDB(sos, +f, 44100)
		ok(Math.abs(got - expected) < tol, `A-weighting@44100 ${f}Hz: expected ${expected}dB, got ${got.toFixed(2)}dB`)
	}
})

// ═══════════════════════════════════════════════════════════════════════════
// Cross-cutting API contract (shared by all 5 weighting filters)
// ═══════════════════════════════════════════════════════════════════════════

const FILTERS = [
	['aWeighting', audio.aWeighting, 44100, 48000],
	['cWeighting', audio.cWeighting, 44100, 96000],
	['kWeighting', audio.kWeighting, 48000, 44100],
	['itu468', audio.itu468, 48000, 96000],
	['riaa', audio.riaa, 44100, 48000]
]

test('weighting filters — all five expose .coefs as a function', () => {
	for (let [name, fn] of FILTERS)
		is(typeof fn.coefs, 'function', `${name}.coefs is a function`)
})

test('weighting filters — recompute _sos/_fs when params.fs changes mid-stream', () => {
	for (let [name, fn, fs1, fs2] of FILTERS) {
		let p = { fs: fs1 }
		fn(impulse(32), p)
		let sos1 = p._sos
		is(p._fs, fs1, `${name} caches initial fs`)
		p.fs = fs2
		fn(impulse(32), p)
		ok(p._sos !== sos1, `${name} recomputes sos on fs change ${fs1}->${fs2}`)
		is(p._fs, fs2, `${name} updates cached fs to ${fs2}`)
	}
})

test('weighting filters — dfFilter reads only .coefs/.state (params.coefs is set)', () => {
	for (let [name, fn] of FILTERS) {
		let p = {}
		fn(impulse(8), p)
		ok(p.coefs === p._sos, `${name} params.coefs aliases params._sos`)
	}
})

test('aWeighting/cWeighting — dense freqz sweep matches magDB reference (cross-check util.js vs digital-filter\'s own freqz/mag2db)', () => {
	// Both magDB (test/util.js) and freqz+mag2db (digital-filter) evaluate the
	// same biquad transfer function in closed form; comparing them at freqz's
	// own bin frequencies across a dense sweep guards against a formula
	// transcription bug in either implementation, beyond the handful of
	// discrete spec-table points checked elsewhere in this file.
	for (let fs of [44100, 48000, 96000]) {
		for (let name of ['aWeighting', 'cWeighting']) {
			let sos = audio[name].coefs(fs)
			let resp = freqz(sos, 512, fs)
			for (let i = 1; i < 512; i += 23) {
				let f = resp.frequencies[i]
				let dbFreqz = mag2db(resp.magnitude[i])
				let dbLocal = magDB(sos, f, fs)
				almost(dbFreqz, dbLocal, 1e-9, `${name}@${fs} ${f.toFixed(1)}Hz: freqz ${dbFreqz} vs magDB ${dbLocal}`)
			}
		}
	}
})

// B-weighting: no IEC 61672 table (superseded by A/C in the modern standard) — the
// only citable reference for the retained ANSI S1.4 curve is a-weighting's own b(f)
// closed form (independently published npm package), differential-tested directly.
import { b as bRef } from 'a-weighting'

test('bWeighting — differential vs a-weighting reference (matched-Z, same bound as A/C near Nyquist)', () => {
	let sos = audio.bWeighting.coefs(44100)
	for (let f of [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000]) {
		let ref = 20 * Math.log10(bRef(f) / bRef(1000))
		let got = magDB(sos, f, 44100)
		let tol = f >= 8000 ? 1.5 : 0.5   // same matched-Z tolerance A/C already use at these bands
		ok(Math.abs(got - ref) < tol, `B-weighting ${f}Hz: ref ${ref.toFixed(2)}, got ${got.toFixed(2)} dB`)
	}
})

test('bWeighting — 3 SOS sections, 0dB at 1kHz, produces output', () => {
	let sos = audio.bWeighting.coefs(44100)
	is(sos.length, 3, 'double pole f1 + single pole f2 + double pole f4 = 3 sections')
	almost(magDB(sos, 1000, 44100), 0, 1e-6)
	let data = impulse(4096)
	let p = { fs: 44100 }
	audio.bWeighting(data, p)
	ok(data.some(x => Math.abs(x) > EPSILON), 'bWeighting produces output')
})

// D-weighting: withdrawn from the modern standard (IEC 537 aircraft-noise curve) — no IEC
// 61672 table to check against, so differential-test the realized filter against a-weighting's
// own d(f) closed form, relative to 1 kHz (same pattern as B). Matched-z rolloff widens the
// gap near Nyquist exactly as it does for A/C, hence the looser bound at 8 kHz.
import { d as dRef } from 'a-weighting'

test('dWeighting — differential vs a-weighting reference (relative to 1kHz)', () => {
	let sos = audio.dWeighting.coefs(44100)
	let ref1k = 20 * Math.log10(dRef(1000)), got1k = magDB(sos, 1000, 44100)
	for (let f of [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 6300, 8000]) {
		let ref = 20 * Math.log10(dRef(f)) - ref1k
		let got = magDB(sos, f, 44100) - got1k
		let tol = f >= 8000 ? 1.5 : 0.5
		ok(Math.abs(got - ref) < tol, `D-weighting ${f}Hz: ref ${ref.toFixed(2)}, got ${got.toFixed(2)} dB`)
	}
})

test('dWeighting — 2 SOS sections, 0dB at 1kHz, resonant hump ~+11.5dB near 3.15kHz', () => {
	let sos = audio.dWeighting.coefs(44100)
	is(sos.length, 2, 'complex zero pair + complex pole pair fold with the real poles / DC zero into 2 sections')
	almost(magDB(sos, 1000, 44100), 0, 1e-6)
	// standard D-weighting is +11.5 dB at the 3.15 kHz third-octave band (rel 1 kHz)
	let hump = magDB(sos, 3150, 44100)
	ok(Math.abs(hump - 11.5) < 0.3, `D-weighting hump ~+11.5dB at 3.15kHz, got ${hump.toFixed(2)}dB`)
	ok(hump > magDB(sos, 1000, 44100) && hump > magDB(sos, 8000, 44100), 'hump exceeds the 1kHz and 8kHz shoulders')
	let data = impulse(4096)
	audio.dWeighting(data, { fs: 44100 })
	ok(data.some(x => Math.abs(x) > EPSILON), 'dWeighting produces output')
})

// .response(f, fs) — self-consistency: must equal the atom's own coefs()' magnitude,
// not an independent reimplementation (that's the whole point: it describes what the
// shipped filter actually does, not a parallel analog approximation that could drift).
test('response() is exactly the atom\'s own filter magnitude, for A/B/C/D, at several fs', () => {
	for (let fs of [44100, 48000, 96000]) {
		for (let name of ['aWeighting', 'bWeighting', 'cWeighting', 'dWeighting']) {
			let sos = audio[name].coefs(fs)
			for (let f of [100, 1000, 8000]) {
				almost(audio[name].response(f, fs), Math.pow(10, magDB(sos, f, fs) / 20), 1e-9,
					`${name}.response(${f}, ${fs}) matches its own coefs()`)
			}
		}
	}
})

test('response(1000) is unity for A/B/C/D/itu468 (0dB normalization)', () => {
	for (let name of ['aWeighting', 'bWeighting', 'cWeighting', 'dWeighting', 'itu468']) almost(audio[name].response(1000), 1, 1e-9, name)
})

test('kWeighting/riaa response() matches their own coefs()\' magnitude', () => {
	for (let fs of [44100, 48000, 96000]) {
		let sos = audio.kWeighting.coefs(fs)
		for (let f of [100, 1000, 8000]) {
			almost(audio.kWeighting.response(f, fs), Math.pow(10, magDB(sos, f, fs) / 20), 1e-9,
				`kWeighting.response(${f}, ${fs}) matches its own coefs()`)
		}
	}
	for (let fs of [44100, 48000, 96000]) {
		let sos = audio.riaa.coefs(fs)
		for (let f of [100, 1000, 8000]) {
			almost(audio.riaa.response(f, fs), Math.pow(10, magDB(sos, f, fs) / 20), 1e-9,
				`riaa.response(${f}, ${fs}) matches its own coefs()`)
		}
	}
})

test('riaa.response(1000) is unity (0dB normalization at 1kHz)', () => {
	for (let fs of [44100, 48000, 96000]) almost(audio.riaa.response(1000, fs), 1, 1e-9, `riaa@${fs}`)
})

test('response() memoizes the design per rate: alternating rates stay exact', async () => {
	let { cascadeMagnitude } = await import('@audio/biquad')
	for (let name of ['aWeighting', 'bWeighting', 'cWeighting', 'dWeighting', 'kWeighting', 'itu468', 'riaa'])
		for (let fs of [44100, 48000, 44100, 96000, 48000]) for (let f of [50, 1000, 12000])
			is(audio[name].response(f, fs), cascadeMagnitude(audio[name].coefs(fs), f, fs), `${name} ${f} Hz @ ${fs}`)
})

test('kWeighting.ms ≡ mean square of kWeighting on float64 copies, state carried, any channel count', () => {
	let fs = 44100, N = 5000
	for (let nch of [1, 2, 3, 5]) {
		let chs = Array.from({ length: nch }, (_, c) => Float32Array.from({ length: N }, (_, i) => Math.sin(i * (0.01 + c * 0.003)) * 0.7 + Math.sin(i * 1.7 + c) * 0.2))
		let refP = chs.map(() => ({ fs })), p = { fs }
		for (let o = 0; o < N; o += 1024) {
			let blk = chs.map(x => x.subarray(o, o + 1024)), got = audio.kWeighting.ms(blk, p)
			let want = blk.map((x, c) => { let y = Float64Array.from(x); audio.kWeighting(y, refP[c]); let s = 0; for (let i = 0; i < y.length; i++) s += y[i] * y[i]; return s / y.length })
			ok(want.every((v, c) => v === got[c]), `${nch} ch, block @${o}: ${got[0]}`)
		}
		ok(chs.every((x, c) => x[7] === Math.fround(Math.sin(7 * (0.01 + c * 0.003)) * 0.7 + Math.sin(7 * 1.7 + c) * 0.2)), 'input untouched')
	}
})

// The /audio manifests as a host drives them: a stub ctx (CONTRACT.md, Context), process() called in blocks
const ATOMS = [['aWeighting', aAtom, 'weighting-a'], ['bWeighting', bAtom, 'weighting-b'], ['cWeighting', cAtom, 'weighting-c'], ['dWeighting', dAtom, 'weighting-d'],
	['itu468', ituAtom, 'weighting-itu468'], ['kWeighting', kAtom, 'weighting-k'], ['riaa', riaaAtom, 'weighting-riaa']]
function host (m, x, fs, block = () => 128) {
	let proc = m({ sampleRate: fs, maxBlockSize: 1024, maxChannels: 2, params: {}, buffers: {} })
	let a = Float32Array.from(x), y = new Float32Array(x.length)
	for (let pos = 0, i = 0; pos < x.length; i++) {
		let n = Math.min(block(i), x.length - pos)
		proc([[a.subarray(pos, pos + n)]], [[y.subarray(pos, pos + n)]], {})
		pos += n
	}
	x.set(y)
	return x
}

test('weighting audio.js – a host\'s blocks of any size give the kernel\'s output, bit for bit, at any rate', () => {
	for (let [name, m] of ATOMS) for (let fs of [8000, 44100, 48000, 96000, 192000]) {
		let x = Float64Array.from({ length: 5000 }, (_, i) => 0.5 * Math.sin(i * 0.031) + 0.3 * Math.sin(i * 1.7)), k = 0
		let got = host(m, Float64Array.from(x), fs, () => [1, 7, 64, 128, 1000][k++ % 5])
		let want = Float32Array.from(x)
		audio[name](want, { fs })
		ok(got.every((v, i) => Object.is(v, want[i])), `${name} at ${fs}: the kernel's output`)
	}
})

// CONTRACT.md, process: never write NaN or Infinity. These curves have no params: full-scale noise in at every rate a
// host may run, 2 channels, calls of 128 frames (the families' one test of this over every processor; these were finite
// before this test was written)
test('weighting audio.js – every processor writes finite numbers for noise in, 8 to 192 kHz', () => {
	let seed = 7, noise = Float32Array.from({ length: 8192 }, () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2147483648 - 1)
	for (let [name, m] of ATOMS) for (let fs of [8000, 22050, 44100, 48000, 96000, 192000]) {
		let p = m({ sampleRate: fs, maxBlockSize: 128, maxChannels: 2, params: {}, buffers: {} }), y = [new Float32Array(noise.length), new Float32Array(noise.length)]
		for (let pos = 0; pos < noise.length; pos += 128) p([[noise.subarray(pos, pos + 128), noise.subarray(pos, pos + 128)]], [y.map(c => c.subarray(pos, pos + 128))], {})
		ok(y.every(c => c.every(Number.isFinite)), `${name} at ${fs}: finite`)
	}
})

// A tail as a host takes it: a number of seconds, or a function of the setting (CONTRACT.md, Latency, tail)
const declared = (m, sampleRate) => typeof m.tail === 'function' ? m.tail({ sampleRate, params: {}, buffers: {} }) : m.tail ?? 0

// The tail, by @audio/biquad's rule, computed here directly from each curve's own sections: the impulse response run
// through them, its |h| summed from the end, the tail the frames before the first frame from which that rest is under
// 1e-3 (0 at 128 frames or under). What each declares (one number for all rates) is never less, and at most 2 % more
test('weighting audio.js – each tail: never under the rest of Σ|h| summed here from its sections, at most 2 % over, at 8 to 192 kHz', () => {
	for (let [name, m] of ATOMS) for (let fs of [8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000, 176400, 192000]) {
		let h = new Float64Array(1 << 18), rest = 0, k = h.length
		h[0] = 1
		audio[name](h, { fs })
		while (k > 0 && rest + Math.abs(h[k - 1]) <= 1e-3) rest += Math.abs(h[--k])
		let D = k - 1 <= 128 ? 0 : k - 1, T = declared(m, fs) * fs
		ok(T >= D && T <= Math.max(128, 1.02 * D), `${name} at ${fs}: declares ${T.toFixed(1)} frames, the rest summed here ${D}`)
	}
})

// The tail against what sounds (test/util.js rings: an impulse, the validator's noise burst, a DC step, tones over the
// spectrum and at the curve's peak, each to 60 dB under the input's level): never short, and at most 1.5 times the
// longest ring where that is over 128 frames
test('weighting audio.js – each tail: never short of the rings of an impulse, noise, a DC step and held tones; at most 1.5 times the longest', () => {
	for (let [name, m] of ATOMS) for (let fs of [8000, 44100, 48000, 96000, 192000]) {
		let sos = audio[name].coefs(fs), peak = 1000, top = -Infinity
		for (let f = 10; f < 0.49 * fs; f *= 1.01) { let g = magDB(sos, f, fs); if (g > top) { top = g; peak = f } }
		let T = declared(m, fs) * fs, r = rings(x => host(m, x, fs), T, { fs, freqs: [peak, ...Array.from({ length: 16 }, (_, i) => 10 * (0.45 * fs / 10) ** (i / 15))] })
		ok(!r.short && r.over <= 1.5, `${name} at ${fs}: ${T.toFixed(0)} frames; rings impulse ${r.impulse}, dc ${r.dc}, tone ${r.tone} (${r.toneAt.toFixed(0)} Hz), noise ${r.noise}`)
	}
})

test('weighting audio.js – process() allocates nothing, warm; nor a second instance made after the first ran', { timeout: 120000 }, async () => {
	for (let [, m, pkg] of ATOMS) for (let how of ['fixed', 'second'])
		is(await collections(fileURLToPath(new URL(`./packages/${pkg}/audio.js`, import.meta.url)), m.name, how), 0, `${m.name}, ${how}: no collection in 2^17 blocks of 8 frames`)
})

// The family's manifests: audio.js names every member that has a manifest (a package of packages/ the umbrella depends
// on, with an audio.js), and no other; each name a member's manifest exports is the entry's, the same binding
test('audio.js lists every member that has a manifest', async () => {
	const { readdirSync, existsSync, readFileSync } = await import('node:fs')
	const at = p => new URL(p, import.meta.url), { dependencies } = JSON.parse(readFileSync(at('package.json'), 'utf8'))
	const members = readdirSync(at('packages')).filter(d => existsSync(at(`packages/${d}/audio.js`)))
		.map(d => JSON.parse(readFileSync(at(`packages/${d}/package.json`), 'utf8')).name).filter(n => n in dependencies).sort()
	const listed = [...readFileSync(at('audio.js'), 'utf8').matchAll(/^export \* from '(@audio\/[^']+)\/audio'$/gm)].map(m => m[1]).sort()
	is(listed, members, 'one line per member, no other')
	const family = await import(at('audio.js')), missing = []
	for (const m of members) for (const [k, v] of Object.entries(await import(`${m}/audio`))) if (k !== 'default' && family[k] !== v) missing.push(`${m}: ${k}`)
	is(missing, [], 'every name a member\'s manifest exports, the same binding')
})
