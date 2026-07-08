import dfFilter from 'digital-filter/core/filter.js'
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

export default function bWeighting(data, params = {}) {
	let fs = params.fs || 44100
	if (!params._sos || params._fs !== fs) {
		params._fs = fs
		params._sos = bWeighting.coefs(fs)
		params.coefs = params._sos
	}
	return dfFilter(data, params)
}

bWeighting.coefs = function coefs(fs = 44100) {
	// B-weighting: H(s) = K·s³ / ((s+w1)²(s+w2)(s+w4)²). Shares f1/f4 with A/C-weighting
	// but its own single mid pole at 158.5 Hz (not A's f2=107.65/f3=737.86) — the original
	// ANSI B-curve corner, distinct from the later-harmonized A/C poles. Confirmed against
	// this repo's own a-weighting.b() reference: denominator (f²+424.36)·sqrt(f²+25122.25)
	// ·(f²+148840000) ⇒ f2 = sqrt(25122.25) = 158.5 exactly.
	let f1 = 20.598997, f2 = 158.5, f4 = 12194.217
	let w = f => 2 * PI * f
	return matchedZ(
		[-w(f1), -w(f1), -w(f2), -w(f4), -w(f4)],
		[0, 0, 0],
		fs,
		1000
	)
}

/** |H(f)| at a given frequency, fs — the analytic response of bWeighting's own filter. */
bWeighting.response = function response (f, fs = 44100) {
	return sosMagnitude(bWeighting.coefs(fs), f, fs)
}
