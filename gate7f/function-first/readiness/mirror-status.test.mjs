import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const script = await readFile(new URL('./Mirror-HomeCampaignStatus.ps1', import.meta.url), 'utf8');
test('hardware mirror is bounded, exact-owned and observation-only on Home', () => {
  for (const marker of ['ValidateRange(5,3900)', 'WaitForExit(20000)', 'Start-Sleep -Seconds 5',
    'm1-mirror-pin-invalid', 'm1-mirror-target-invalid', 'mirror-source-drift', 'mirror-file-reparse',
    'mirror-existing-binding-mismatch', 'runaai-m1-campaign-live/v1', 'lastTelemetry=$telemetry']) assert.ok(script.includes(marker), marker);
  const probe = script.split("$homeProbe=@'")[1].split("'@")[0];
  assert.match(probe, /Get-FileHash/);
  assert.match(probe, /Get-Process -Id \$worker.pid/);
  assert.match(probe, /Get-ScheduledTask/);
  assert.match(probe, /\/api\/v1\/models'/);
  assert.doesNotMatch(probe, /WriteAll|Set-Content|Remove-Item|Move-Item|Stop-Process|Start-Process|Register-ScheduledTask|nvidia-smi|models\/load|models\/unload/);
  assert.match(script, /\[IO.File\]::Replace\(\$temporary,\$file,\$null\)/);
  assert.match(script, /readOnlyOnHome=\$true/);
});
