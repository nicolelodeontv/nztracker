export const AMF_PROBE_KNOWN_UNAUTHORIZED = 'known_unauthorized';
export const AMF_PROBE_SUCCESS = 'success';
export const AMF_PROBE_FAILURE = 'failure';

export function isKnownAmfAuthorizationDenial(error) {
  const response = error?.amfResponse;
  return String(response?.status ?? '') === '0'
    && String(response?.message ?? '') === '401';
}

export function classifyAmfProbeError(error) {
  if (isKnownAmfAuthorizationDenial(error)) {
    return {
      ok: true,
      status: AMF_PROBE_KNOWN_UNAUTHORIZED,
      httpStatus: 200,
      message: 'AMF authorization is pending external resolution.',
    };
  }
  return {
    ok: false,
    status: AMF_PROBE_FAILURE,
    httpStatus: 502,
    message: error instanceof Error ? error.message : String(error || 'AMF probe failed.'),
  };
}

export function buildAmfProbeSuccess(result) {
  return {
    ok: true,
    source: 'amf',
    status: AMF_PROBE_SUCCESS,
    count: result.count,
    diagnostics: result.sourceDiagnostics?.amf || null,
  };
}
