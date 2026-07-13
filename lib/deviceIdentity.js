'use strict';

// Device identity helper — device-identity spec §Decision, §Component design
// (docs/superpowers/specs/2026-07-13-device-identity-design.md).
// Derives the immutable Homey data.id from the controller's serial number
// (HW_SERIAL_CARRIER — manufacturer-confirmed unique per unit, present in
// getReadings?ALL). Pure and Homey-free: returns null instead of throwing so
// the driver owns the localized fail-closed error (spec §Pairing-error).

/**
 * Derive the stable device id from a getReadings payload.
 * Same controller → same serial → same data.id, so Homey itself blocks
 * pairing the same unit twice (spec §Decision).
 * @param {import('./VioletClient').RawReadings} raw Parsed getReadings?ALL payload.
 * @returns {?string} Trimmed serial string, or null when absent/blank (driver fails closed).
 */
function deriveDeviceId(raw) {
  const serial = String(raw.HW_SERIAL_CARRIER ?? '').trim();
  return serial || null;
}

module.exports = { deriveDeviceId };
