// The version handshake (D-29): the host says hello with its version; the engine answers welcome, or refuse
// when the major numbers differ. Both sides check, so neither trusts the other's comparison.
import { protocolError, type ProtocolError } from './errors.ts';
import { formatVersion, isCompatible, PROTOCOL_VERSION, type ProtocolVersion } from './version.ts';

export function checkPeerVersion(remote: ProtocolVersion, local: ProtocolVersion = PROTOCOL_VERSION): ProtocolError | null {
  if (isCompatible(local, remote)) return null;
  return protocolError('protocol_mismatch', { expected: formatVersion(local), received: formatVersion(remote) });
}
