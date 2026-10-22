import { describe, it, expect } from 'vitest';
import { validateFileMagicBytes, MAX_FILE_SIZE_BYTES } from '../src/lib/crypto';

describe('TrustVault Server-Side File Validation & Magic Byte Sniffing', () => {
  it('Accepts authentic PDF file with %PDF magic bytes', () => {
    const validPdfBuffer = Buffer.from('%PDF-1.7\n%Valid Financial Statement\n%%EOF');
    const result = validateFileMagicBytes(validPdfBuffer, 'financial_statement.pdf', 'application/pdf');

    expect(result.isValid).toBe(true);
    expect(result.detectedMime).toBe('application/pdf');
  });

  it('Detects and REJECTS executable payload disguised as PDF (polyglot attack)', () => {
    // Windows PE / MZ executable signature (4D 5A) disguised as .pdf
    const maliciousBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00...Simulated executable binary payload');
    const result = validateFileMagicBytes(maliciousBuffer, 'invoice_fake.pdf', 'application/pdf');

    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Unrecognized or disguised file format');
  });

  it('Rejects files with disallowed extensions (.exe, .sh, .bat)', () => {
    const buffer = Buffer.from('echo "Malicious script"');
    const result = validateFileMagicBytes(buffer, 'run_script.exe', 'application/x-msdownload');

    expect(result.isValid).toBe(false);
    expect(result.error).toContain('not permitted');
  });

  it('Rejects oversized uploads exceeding 10MB limit', () => {
    // Buffer slightly larger than 10MB
    const oversizedBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1024);
    const result = validateFileMagicBytes(oversizedBuffer, 'huge_file.pdf', 'application/pdf');

    expect(result.isValid).toBe(false);
    expect(result.error).toContain('File size exceeds 10MB limit');
  });

  it('Accepts authentic PNG images', () => {
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const result = validateFileMagicBytes(pngHeader, 'signature.png', 'image/png');

    expect(result.isValid).toBe(true);
    expect(result.detectedMime).toBe('image/png');
  });

  it('Detects binary null bytes inside masquerading .txt file', () => {
    // Text file containing binary null and control characters
    const corruptedText = Buffer.from('Plaintext header\x00\x01\x02binary payload');
    const result = validateFileMagicBytes(corruptedText, 'notes.txt', 'text/plain');

    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Binary executable/control content detected');
  });
});
