/**
 * SphericalHarmonics provides static utilities for Ambisonic spatial audio processing,
 * specifically involving real spherical harmonics up to 3rd order.
 *
 * This class includes:
 * - Conversion between SN3D and N3D normalization schemes.
 * - Construction of decoder matrices based on grid directions.
 * - Application of MaxRe (maximum energy vector) weights.
 * - Evaluation of real spherical harmonics at arbitrary directions.
 * - Computation of directional energy from spherical harmonic coefficients.
 *
 * Assumes a maximum Ambisonic order of 3 (16 coefficients).
 *
 * Typical usage:
 * ```
 * const n3dCoeffs = SphericalHarmonics.convertShCoefficientsSn3dToN3d(sn3dCoeffs);
 * const decoder = SphericalHarmonics.buildDecoderMatrixWithMaxRe();
 * ```
 */

// import gridData from '@/spaceSoundfieldVisualizer/hammerAitovGrid.json';

class SphericalHarmonics {
  /**
   * Builds a decoder matrix using real spherical harmonics evaluated at unit sphere directions
   * from a grid file, and applies MaxRe weights.
   * @param {number} order - Ambisonic order (assumes 3rd order: 16 SH coefficients).
   * @returns {Float32Array} - Flattened decoder matrix (directions × 16).
   */
  static buildDecoderMatrixWithMaxRe(order = 3) {
    const vectors = gridData.unitSphereVectors; // [x0, y0, z0, x1, y1, z1, ...]
    const decoderMatrixRows = [];

    for (let i = 0; i < vectors.length; i += 3) {
      const x = vectors[i];
      const y = vectors[i + 1];
      const z = vectors[i + 2];
      const row = SphericalHarmonics.evaluateSH(x, y, z);
      decoderMatrixRows.push(row);
    }

    const weightedRows = SphericalHarmonics.applyMaxReWeights(decoderMatrixRows, order);
    const flattened = new Float32Array(weightedRows.length * 16);
    for (let i = 0; i < weightedRows.length; i++) {
      flattened.set(weightedRows[i], i * 16);
    }

    return flattened;
  }

  /**
   * Converts normalization factors for spherical harmonic coefficients
   * from SN3D (semi-normalized) to N3D (fully normalized).
   * @param {number} order - A given Ambisonics order.
   * @returns {Float32Array} - A typed array of conversion factors.
   *
   * Factors derived using the formula:
   *   N3D(l, m) = SN3D(l, m) * sqrt(2l + 1)
   * Source: AmbiX conventions.
   */
  static convertShCoefficientsSn3dToN3d(order) {
    const factors = [];
    for (let l = 0; l <= order; l++) {
      const factor = Math.sqrt(2 * l + 1);
      for (let m = -l; m <= l; m++) {
        factors.push(factor);
      }
    }
    return new Float32Array(factors);
  }

  /**
   * Applies MaxRe weights to a decoder matrix for a given Ambisonic order.
   * @param {number[][]} decoderMatrix - Decoder matrix (directions x coefficients).
   * @param {number} order - Ambisonic order.
   * @returns {number[][]} Decoder matrix with MaxRe weights applied.
   */
  static applyMaxReWeights(decoderMatrix, order) {
    const weights = [];
    let index = 0;
    for (let l = 0; l <= order; l++) {
      const w = Math.cos((Math.PI * l) / (2 * order + 2));
      for (let m = -l; m <= l; m++) {
        weights[index++] = w;
      }
    }

    for (let i = 0; i < decoderMatrix.length; i++) {
      for (let j = 0; j < decoderMatrix[i].length; j++) {
        decoderMatrix[i][j] *= weights[j];
      }
    }

    return decoderMatrix;
  }

  /**
   * Evaluates real spherical harmonics up to 3rd order for a given direction.
   * @param {number} x - X coordinate on unit sphere.
   * @param {number} y - Y coordinate on unit sphere.
   * @param {number} z - Z coordinate on unit sphere.
   * @returns {Float32Array} - 16 SH coefficients.
   */
  static evaluateSH(x, y, z) {
    y = -y;
    z = -z;
    const result = new Float32Array(16);
    result[0] = 0.282095;
    result[1] = 0.488603 * y;
    result[2] = 0.488603 * z;
    result[3] = 0.488603 * x;
    result[4] = 1.092548 * x * y;
    result[5] = 1.092548 * y * z;
    result[6] = 0.315392 * (3.0 * z * z - 1.0);
    result[7] = 1.092548 * x * z;
    result[8] = 0.546274 * (x * x - y * y);
    result[9] = 0.590044 * y * (3.0 * x * x - y * y);
    result[10] = 2.890611 * x * y * z;
    result[11] = 0.457046 * y * (5.0 * z * z - 1.0);
    result[12] = 0.373176 * (5.0 * z * z - 3.0) * z;
    result[13] = 0.457046 * x * (5.0 * z * z - 1.0);
    result[14] = 1.445306 * z * (x * x - y * y);
    result[15] = 0.590044 * x * (x * x - 3.0 * y * y);
    return result;
  }
}

export default SphericalHarmonics;
