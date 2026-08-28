import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
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
  assert.match(script, /\[IO.File\]::Replace\(\$temporary,\$file,\[System.Management.Automation.Language.NullString\]::Value\)/);
  assert.match(script, /readOnlyOnHome=\$true/);
});
test('actual Windows PowerShell5 mirror replacement preserves the latest complete JSON', async () => {
  const parent = await realpath(os.tmpdir());
  const root = await mkdtemp(path.join(parent, 'runa-m1-mirror-replace-'));
  try {
    const file = path.join(root, 'home-live.json'), temporary = path.join(root, 'home-live.json.new');
    await writeFile(file, JSON.stringify({ revision: 1 }));
    await writeFile(temporary, JSON.stringify({ revision: 2 }));
    const statement = script.match(/\[IO.File\]::Replace\(\$temporary,\$file,[^\r\n]+?\)/)?.[0];
    assert.ok(statement);
    const quote = value => value.replaceAll("'", "''");
    const program = `$ErrorActionPreference='Stop';$file='${quote(file)}';$temporary='${quote(temporary)}';${statement};[Console]::Out.Write([IO.File]::ReadAllText($file))`;
    const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(program, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    assert.equal(JSON.parse(output).revision, 2);
    await assert.rejects(readFile(temporary), { code: 'ENOENT' });
  } finally {
    const resolved = await realpath(root);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('runa-m1-mirror-replace-'));
    await rm(resolved, { recursive: true, force: false });
  }
});
