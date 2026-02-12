/**
 * Extract waveform peak amplitudes from a 16-bit PCM WAV buffer.
 * Returns an array of normalized peak values (0-1) for visualization.
 */
export function extractWaveformPeaks(
  wavBuffer: ArrayBuffer,
  numPeaks: number = 200,
): number[] {
  const view = new DataView(wavBuffer);

  // Verify RIFF header
  const riff = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (riff !== "RIFF") {
    throw new Error("Not a valid WAV file");
  }

  // Standard WAV: data chunk starts at byte 44, length at byte 40
  const dataLength = view.getUint32(40, true);
  const dataOffset = 44;

  // Number of 16-bit samples
  const numSamples = dataLength / 2;
  const samplesPerPeak = Math.floor(numSamples / numPeaks);

  if (samplesPerPeak === 0) {
    // Very short file — return what we have
    const peaks: number[] = [];
    for (let i = 0; i < numSamples && i < numPeaks; i++) {
      const sample = Math.abs(view.getInt16(dataOffset + i * 2, true));
      peaks.push(sample / 32768);
    }
    return peaks;
  }

  const peaks: number[] = [];
  for (let i = 0; i < numPeaks; i++) {
    let maxAmplitude = 0;
    const startSample = i * samplesPerPeak;
    const endSample = Math.min(startSample + samplesPerPeak, numSamples);

    for (let j = startSample; j < endSample; j++) {
      const sample = Math.abs(view.getInt16(dataOffset + j * 2, true));
      if (sample > maxAmplitude) {
        maxAmplitude = sample;
      }
    }

    peaks.push(maxAmplitude / 32768);
  }

  return peaks;
}
