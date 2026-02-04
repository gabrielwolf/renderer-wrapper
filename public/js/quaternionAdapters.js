/**
 * Quaternion without any RH / LH or XYZ convention:
 *
 * @typedef {Object} Quaternion
 * @property {number} w
 * @property {number} x
 * @property {number} y
 * @property {number} z
 */

/**
 * RotationQuaternion:
 * - A normalized quaternion representing an orientation/rotation.
 * - The type guarantees only that it's a valid rotation quaternion ({w,x,y,z}).
 * - Axis/frame conventions depend on the producing system.
 *
 * @typedef {Object} RotationQuaternion
 * @property {number} w
 * @property {number} x
 * @property {number} y
 * @property {number} z
 */

/**
 * OmnitoneQuaternion:
 * - Quaternion expressed in Omnitone's coordinate and azimuth conventions.
 * - Includes required basis change and Omnitone convention shim.
 * - Safe to pass directly to Omnitone.setRotationMatrix3().
 *
 * IMPORTANT:
 * - This is NOT a generic rotation quaternion.
 * - This type marks a semantic boundary, not a mathematical difference.
 *
 * @typedef {Object} OmnitoneQuaternion
 * @property {number} w
 * @property {number} x
 * @property {number} y
 * @property {number} z
 */

/**
 * Internal immutable identity quaternion (neutral element).
 * Do not export directly to avoid shared mutable references.
 * @type {Quaternion}
 */
const _IDENTITY_QUATERNION = Object.freeze({w: 1, x: 0, y: 0, z: 0});

/**
 * Returns a fresh copy of the identity quaternion.
 *
 * @returns {Quaternion}
 */
export function identityQuaternion() {
  return {..._IDENTITY_QUATERNION};
}

/**
 * Adapter for WebSocket input (assumes Y ↔ Z swapped like in Supperware Bridgehead´s "Quaternion (Composite)" setting)
 * @param {Quaternion} quaternion
 * @returns {Quaternion}
 */
export function fromWebSocketQuaternionToQuaternion(quaternion) {
  const {w, x, y, z} = quaternion;
  return {
    w: w,
    x: y, // pitch → roll
    y: x, // roll → yaw
    z: z, // keep z
  };
}

/**
 * Converts a RotationQuaternion (RH: +X front, +Y left, +Z up) to WebGPU format.
 *
 * @param {RotationQuaternion} quaternion - Rotation quaternion
 * @returns {Quaternion} - WebGPU-compatible quaternion
 */
export function toWebGpuQuaternion(quaternion) {
  const {w, x, y, z} = quaternion;
  return {
    x: -y,
    y: -z,
    z: -x,
    w: w,
  };
}

/**
 * Converts a RotationQuaternion to an Omnitone-compatible quaternion.
 *
 * @param {RotationQuaternion} quaternion
 * @returns {OmnitoneQuaternion} quaternion
 */
export function toOmnitoneQuaternionFromRotationQuaternion(quaternion) {
  const {w, x, y, z} = quaternion;

  // AmbiX/IEM frame (RH): +X front, +Y left, +Z up
  // Omnitone frame: +X right, +Y up, +Z back
  // Pure basis change (det=+1): map vector part, keep w.
  const omnitoneBasis = {
    w,
    x: -y,
    y: z,
    z: -x,
  };
  // Known quirk: align default forward/azimuth with AmbiX.
  const omnitoneConventionShim = {w: 0, x: 0, y: 1, z: 0};
  return quaternionMultiply(omnitoneConventionShim, omnitoneBasis);
}

/**
 * Convert degrees to radians.
 *
 * Explicit helper to avoid hidden conversions and magic constants.
 *
 * @param {number} degrees
 * @returns {number}
 */
export function degreesToRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Create a quaternion from an axis-angle rotation.
 *
 * The axis does NOT need to be normalized.
 * The angle must be given in radians.
 *
 * @param {number} axisX
 * @param {number} axisY
 * @param {number} axisZ
 * @param {number} angleRad
 * @returns {Quaternion}
 */
export function quaternionFromAxisAngle(axisX, axisY, axisZ, angleRad) {
  const halfAngle = angleRad * 0.5;
  const sinHalf = Math.sin(halfAngle);

  // Normalize axis
  const length = Math.sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ);

  if (length === 0) {
    // No rotation -> identity quaternion
    return {w: 1, x: 0, y: 0, z: 0};
  }

  const nx = axisX / length;
  const ny = axisY / length;
  const nz = axisZ / length;

  return {
    w: Math.cos(halfAngle),
    x: nx * sinHalf,
    y: ny * sinHalf,
    z: nz * sinHalf,
  };
}

/**
 * Create an Omnitone-compatible orientation from azimuth / elevation angles.
 *
 * This function represents a UI-level rotation and intentionally operates
 * in AmbiX space before being mapped into Omnitone conventions.
 *
 * Conventions:
 *  - azimuth   : rotation around +Z (AmbiX up), CCW positive
 *  - elevation : rotation around +Y (AmbiX left), positive = up
 *
 * @param {number} azimuthDegree
 * @param {number} elevationDegree
 * @returns {OmnitoneQuaternion}
 */
export function toOmnitoneQuaternionFromAzimuthAndElevation(azimuthDegree, elevationDegree) {
  const azimuthRadians = degreesToRadians(azimuthDegree);
  const elevationRadians = degreesToRadians(elevationDegree);

  const quaternionFromAzimuth = quaternionFromAxisAngle(0, 0, 1, azimuthRadians);
  const quaternionFromElevation = quaternionFromAxisAngle(0, 1, 0, elevationRadians);

  const rotationQuaternion = quaternionMultiply(quaternionFromAzimuth, quaternionFromElevation);

  // Convert AmbiX rotation into Omnitone convention
  return toOmnitoneQuaternionFromRotationQuaternion(rotationQuaternion);
}

/**
 * Multiplies two quaternions (Hamilton product).
 * Both must use the same coordinate/frame convention
 * and multiplication order assumptions.
 *
 * @param {Quaternion} leftOperand - Added rotation
 * @param {Quaternion} rightOperand - Start rotation
 * @returns {Quaternion} - Resulting combined rotation
 */
export function quaternionMultiply(leftOperand, rightOperand) {
  return {
    w:
      leftOperand.w * rightOperand.w -
      leftOperand.x * rightOperand.x -
      leftOperand.y * rightOperand.y -
      leftOperand.z * rightOperand.z,
    x:
      leftOperand.w * rightOperand.x +
      leftOperand.x * rightOperand.w +
      leftOperand.y * rightOperand.z -
      leftOperand.z * rightOperand.y,
    y:
      leftOperand.w * rightOperand.y -
      leftOperand.x * rightOperand.z +
      leftOperand.y * rightOperand.w +
      leftOperand.z * rightOperand.x,
    z:
      leftOperand.w * rightOperand.z +
      leftOperand.x * rightOperand.y -
      leftOperand.y * rightOperand.x +
      leftOperand.z * rightOperand.w,
  };
}
