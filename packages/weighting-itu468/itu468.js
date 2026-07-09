import { filter } from '@audio/biquad'
import matchedZ from 'digital-filter/core/matched-z.js'

/** Magnitude |H(f)| of this atom's own SOS cascade — self-consistent with the filter above. */
function sosMagnitude (sos, f, fs) {
	let w = 2 * Math.PI * f / fs
	let mag = 1
	for (let s of sos) {
		let nr = s.b0 + s.b1 * Math.cos(w) + s.b2 * Math.cos(2 * w)
		let ni = -(s.b1 * Math.sin(w) + s.b2 * Math.sin(2 * w))
		let dr = 1 + s.a1 * Math.cos(w) + s.a2 * Math.cos(2 * w)
		let di = -(s.a1 * Math.sin(w) + s.a2 * Math.sin(2 * w))
		mag *= Math.hypot(nr, ni) / Math.hypot(dr, di)
	}
	return mag
}

export default function itu468(data, params = {}) {
	let fs = params.fs || 48000
	if (!params._sos || params._fs !== fs) {
		params._fs = fs
		params._sos = itu468.coefs(fs)
		params.coefs = params._sos
	}
	return filter(data, params)
}

itu468.coefs = function coefs(fs = 48000) {
	// ITU-R BS.468-4 noise weighting, exact matched-z realization: peaked at
	// +12.2 dB near 6.3 kHz. Poles found via Durand-Kerner root-finding on the
	// spec's rational polynomial (Rec. ITU-R BS.468-4 Annex 1, reproduced in
	// Wikipedia "ITU-R 468 noise weighting"); the analog prototype matches the
	// spec table to within 0.05 dB across 31.5 Hz–20 kHz. Matched z reproduces
	// this near-exactly away from Nyquist; error grows above ~10 kHz at 44.1/48 kHz.
	return matchedZ(
		[
			{ re: -23615.535214, im: 36379.908937 },
			{ re: -23615.535214, im: -36379.908937 },
			{ re: -18743.746691, im: 62460.156453 },
			{ re: -18743.746691, im: -62460.156453 },
			-25903.701048,
			-62675.170058
		],
		[0],
		fs,
		1000
	)
}

/** |H(f)| at a given frequency, fs — the analytic response of itu468's own filter. */
itu468.response = function response (f, fs = 48000) {
	return sosMagnitude(itu468.coefs(fs), f, fs)
}
