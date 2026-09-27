import { filter, cascadeMagnitude } from '@audio/biquad'

export default function kWeighting(data, params = {}) {
	return filter(data, design(params))
}

function design(params) {
	let fs = params.fs || 48000
	if (!params._sos || params._fs !== fs) {
		params._fs = fs
		params._sos = kWeighting.coefs(fs)
		params.coefs = params._sos
	}
	return params
}

/**
 * Mean square of each channel's K-weighted block, into `out`: the BS.1770 loudness measurement's inner
 * loop. Input untouched; filter state per channel carried on `params.states` across blocks (same params
 * every call). Both sections and the squares run in one pass per sample at float64, channels two at a time:
 * four independent recursions interleaved keep the FPU busy where one waits on its own feedback.
 */
kWeighting.ms = function ms(channels, params = {}, out = new Float64Array(channels.length)) {
	let [c, d] = design(params)._sos, st = params.states ??= [], n = channels.length, k = 0
	for (; k + 1 < n; k += 2) msPair(channels[k], channels[k + 1], c, d, st[k] ??= new Float64Array(4), st[k + 1] ??= new Float64Array(4), out, k)
	if (k < n) msOne(channels[k], c, d, st[k] ??= new Float64Array(4), out, k)
	return out
}

function msOne(x, c, d, s, out, k) {
	let b0 = c.b0, b1 = c.b1, b2 = c.b2, a1 = c.a1, a2 = c.a2, e0 = d.b0, e1 = d.b1, e2 = d.b2, f1 = d.a1, f2 = d.a2
	let z1 = s[0], z2 = s[1], w1 = s[2], w2 = s[3], q = 0
	for (let i = 0, l = x.length; i < l; i++) {
		let v = x[i]
		let y = b0 * v + z1
		z1 = b1 * v - a1 * y + z2
		z2 = b2 * v - a2 * y
		let u = e0 * y + w1
		w1 = e1 * y - f1 * u + w2
		w2 = e2 * y - f2 * u
		q += u * u
	}
	s[0] = z1; s[1] = z2; s[2] = w1; s[3] = w2
	out[k] = q / x.length
}

function msPair(x, x2, c, d, s, t, out, k) {
	let b0 = c.b0, b1 = c.b1, b2 = c.b2, a1 = c.a1, a2 = c.a2, e0 = d.b0, e1 = d.b1, e2 = d.b2, f1 = d.a1, f2 = d.a2
	let z1 = s[0], z2 = s[1], w1 = s[2], w2 = s[3], q = 0
	let r1 = t[0], r2 = t[1], p1 = t[2], p2 = t[3], q2 = 0
	for (let i = 0, l = x.length; i < l; i++) {
		let v = x[i], v2 = x2[i]
		let y = b0 * v + z1, y2 = b0 * v2 + r1
		z1 = b1 * v - a1 * y + z2; r1 = b1 * v2 - a1 * y2 + r2
		z2 = b2 * v - a2 * y; r2 = b2 * v2 - a2 * y2
		let u = e0 * y + w1, u2 = e0 * y2 + p1
		w1 = e1 * y - f1 * u + w2; p1 = e1 * y2 - f1 * u2 + p2
		w2 = e2 * y - f2 * u; p2 = e2 * y2 - f2 * u2
		q += u * u; q2 += u2 * u2
	}
	s[0] = z1; s[1] = z2; s[2] = w1; s[3] = w2
	t[0] = r1; t[1] = r2; t[2] = p1; t[3] = p2
	out[k] = q / x.length; out[k + 1] = q2 / x2.length
}

kWeighting.coefs = function coefs(fs = 48000) {
	// ITU-R BS.1770-4 K-weighting: high-shelf + RLB highpass.
	// Redesigned per sample rate from the canonical analog prototype constants
	// (De Man 2014, "Evaluation of Implementations of the ITU-R BS.1770 Loudness
	// Algorithm"; same as pyloudnorm). At fs=48000 this reproduces the spec's
	// coefficient table to ~1e-11. NB the RLB highpass uses Q≈0.5003, not the
	// shelf's 0.7072, and its b-coefficients stay unnormalized {1,-2,1} per spec.

	// Stage 1: spherical-head high shelf
	let G = 3.999843853973347, Qs = 0.7071752369554196, fc = 1681.974450955533
	let K = Math.tan(Math.PI * fc / fs)
	let Vh = Math.pow(10, G / 20)
	let Vb = Math.pow(Vh, 0.4996667741545416)
	let a0 = 1 + K / Qs + K * K
	let shelf = {
		b0: (Vh + Vb * K / Qs + K * K) / a0,
		b1: 2 * (K * K - Vh) / a0,
		b2: (Vh - Vb * K / Qs + K * K) / a0,
		a1: 2 * (K * K - 1) / a0,
		a2: (1 - K / Qs + K * K) / a0
	}

	// Stage 2: RLB weighting highpass
	let Qh = 0.5003270373238773, fh = 38.13547087602444
	let Kh = Math.tan(Math.PI * fh / fs)
	let d0 = 1 + Kh / Qh + Kh * Kh
	let rlb = {
		b0: 1, b1: -2, b2: 1,
		a1: 2 * (Kh * Kh - 1) / d0,
		a2: (1 - Kh / Qh + Kh * Kh) / d0
	}

	return [shelf, rlb]
}

let respFs = NaN, respSos = null  // the design, memoized per rate: a response curve asks per frequency
/** |H(f)| at a given frequency, fs — the analytic response of kWeighting's own filter. */
kWeighting.response = function response (f, fs = 48000) {
	if (fs !== respFs) { respSos = kWeighting.coefs(fs); respFs = fs }
	return cascadeMagnitude(respSos, f, fs)
}
