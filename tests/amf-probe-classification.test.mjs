import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  AMF_PROBE_FAILURE,
  AMF_PROBE_KNOWN_UNAUTHORIZED,
  AMF_PROBE_SUCCESS,
  buildAmfProbeSuccess,
  classifyAmfProbeError,
  isKnownAmfAuthorizationDenial,
} from '../app/lib/amf-probe.mjs';

test('classifies the confirmed AMF authorization wall as known_unauthorized',()=>{
  const error=new Error('Member service returned application status 0. message=401 keys=status,error');
  error.sourceDiagnostic={
    status:'error',
    httpStatus:200,
    amfResponse:{status:'0',message:'401',httpStatus:200,contentType:'application/x-amf'},
  };

  assert.equal(isKnownAmfAuthorizationDenial(error),true);
  assert.deepEqual(classifyAmfProbeError(error),{
    ok:true,
    status:AMF_PROBE_KNOWN_UNAUTHORIZED,
    httpStatus:200,
    message:'AMF authorization is pending external resolution.',
  });
});

test('does not mask a changed AMF denial shape as the known authorization case',()=>{
  const error=new Error('Member service returned application status 0. message=403 keys=status,error');
  error.sourceDiagnostic={
    status:'error',
    httpStatus:200,
    amfResponse:{status:'0',message:'403',httpStatus:200,contentType:'application/x-amf'},
  };

  assert.equal(isKnownAmfAuthorizationDenial(error),false);
  assert.equal(classifyAmfProbeError(error).status,AMF_PROBE_FAILURE);
  assert.equal(classifyAmfProbeError(error).httpStatus,502);
});

test('treats upstream transport and malformed-response errors as genuine failures',()=>{
  const timeout=new Error('Upstream request timed out after 4.5s.');
  timeout.sourceDiagnostic={status:'timeout',httpStatus:null,error:timeout.message};
  assert.equal(classifyAmfProbeError(timeout).status,AMF_PROBE_FAILURE);
  assert.equal(classifyAmfProbeError(timeout).httpStatus,502);

  const malformed=new Error('Invalid AMF response: truncated at byte 23.');
  malformed.sourceDiagnostic={status:'error',httpStatus:200,error:malformed.message};
  assert.equal(classifyAmfProbeError(malformed).status,AMF_PROBE_FAILURE);
  assert.equal(classifyAmfProbeError(malformed).httpStatus,502);
});

test('builds the successful probe response shape from real member results',()=>{
  const result={
    count:30,
    sourceDiagnostics:{
      amf:{
        status:'success',
        httpStatus:200,
        responseStatus:'1',
        contentType:'application/x-amf',
      },
    },
  };

  assert.deepEqual(buildAmfProbeSuccess(result),{
    ok:true,
    source:'amf',
    status:AMF_PROBE_SUCCESS,
    count:30,
    diagnostics:result.sourceDiagnostics.amf,
  });
});

test('probe route and CI preserve the three-way classification contract',async()=>{
  const route=await readFile(new URL('../app/api/amf-probe/route.js',import.meta.url),'utf8');
  const workflow=await readFile(new URL('../.github/workflows/amf-preview-validation.yml',import.meta.url),'utf8');

  assert.match(route,/status:classification\.status/);
  assert.match(route,/status==='known_unauthorized'/);
  assert.match(route,/status:200/);
  assert.match(route,/status:classification\.httpStatus/);

  assert.match(workflow,/known_unauthorized/);
  assert.match(workflow,/AMF: known authorization pending \(external, tracked separately\)/);
  assert.match(workflow,/AMF genuine failure/);
  assert.match(workflow,/status = "200"/);
});
