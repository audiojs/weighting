// atom manifest — A-weighting (IEC 61672) per @audio/compile CONTRACT. Fixed standard curve:
// no tunable params (params = {} is the processor marker). The sections are designed here for the host's rate and
// each channel's state is primed here, a Float64Array per section, so a block allocates nothing.
import fn from './a-weighting.js'
import { cascade } from '@audio/biquad'

export const aWeighting = (ctx) => {
	const sos = fn.coefs(ctx.sampleRate), st = []
	for (let c = 0; c < ctx.maxChannels; c++) st.push(sos.map(() => new Float64Array(2)))
	return (inputs, outputs) => {
		const inp = inputs[0], out = outputs[0]
		for (let c = 0; c < inp.length; c++) {
			out[c].set(inp[c])
			cascade(out[c], sos, st[c])
		}
	}
}
aWeighting.channels = 'any'
aWeighting.params = {}
// The tail, by @audio/biquad's rule (the frames until the rest of the impulse response, Σ|h| from there on, is under
// 1e-3): the most these sections take at 8 to 192 kHz, in seconds nearly the same at each rate (18.05 to 18.13 ms). 0
// where that is 128 frames or under at the host's rate (CONTRACT.md)
const TAIL = 0.0182
aWeighting.tail = ({ sampleRate }) => sampleRate * TAIL <= 128 ? 0 : TAIL
