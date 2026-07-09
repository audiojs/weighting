import { filter } from '@audio/biquad'
import matchedZ from 'digital-filter/core/matched-z.js'

let { PI } = Math

/** Magnitude |H(f)| of this atom's own SOS cascade — self-consistent with the filter above. */
function sosMagnitude (sos, f, fs) {
	let w = 2 * PI * f / fs
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

export default function cWeighting(data, params = {}) {
	let fs = params.fs || 44100
	if (!params._sos || params._fs !== fs) {
		params._fs = fs
		params._sos = cWeighting.coefs(fs)
		params.coefs = params._sos
	}
	return filter(data, params)
}

cWeighting.coefs = function coefs(fs = 44100) {
	// IEC 61672-1:2013 C-weighting: H(s) = K·s² / ((s+w1)²(s+w4)²)
	let f1 = 20.598997, f4 = 12194.217
	let w = f => 2 * PI * f
	return matchedZ(
		[-w(f1), -w(f1), -w(f4), -w(f4)],
		[0, 0],
		fs,
		1000
	)
}

/** |H(f)| at a given frequency, fs — the analytic response of cWeighting's own filter. */
cWeighting.response = function response (f, fs = 44100) {
	return sosMagnitude(cWeighting.coefs(fs), f, fs)
}
