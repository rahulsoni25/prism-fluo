/**
 * Tests for lib/compress/cloudconvert.ts — the CloudConvert wrapper used
 * by /api/compress and /api/upload/via-cloudconvert. We mock the SDK so
 * tests don't burn real conversion minutes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});
afterEach(() => {
  process.env = ORIGINAL_ENV;
  vi.restoreAllMocks();
});

describe('compressPdfViaCloudConvert', () => {
  it('throws CloudConvertNotConfiguredError when API key is missing', async () => {
    delete process.env.CLOUDCONVERT_API_KEY;
    const { compressPdfViaCloudConvert, CloudConvertNotConfiguredError } =
      await import('@/lib/compress/cloudconvert');
    await expect(compressPdfViaCloudConvert(Buffer.from('test'))).rejects.toBeInstanceOf(CloudConvertNotConfiguredError);
  });

  it('happy path: upload → optimize → export → download', async () => {
    process.env.CLOUDCONVERT_API_KEY = 'ck_test_dummy';

    // Mock CloudConvert SDK
    const mockCC = {
      jobs: {
        create: vi.fn().mockResolvedValue({
          id: 'job-123',
          tasks: [
            { name: 'upload-input',  result: { form: { url: 'https://cc.test/upload', parameters: { foo: 'bar' } } } },
            { name: 'optimize-pdf',  status: 'pending' },
            { name: 'export-result', status: 'pending' },
          ],
        }),
        wait: vi.fn().mockResolvedValue({
          id: 'job-123',
          tasks: [
            { name: 'upload-input',  status: 'finished' },
            { name: 'optimize-pdf',  status: 'finished' },
            { name: 'export-result', status: 'finished', result: { files: [{ url: 'https://cc.test/result.pdf' }] } },
          ],
        }),
      },
      tasks: { upload: vi.fn().mockResolvedValue(undefined) },
    };
    vi.doMock('cloudconvert', () => ({ default: class { constructor() { Object.assign(this, mockCC); } } }));

    // Mock fetch for the result download
    const compressedBytes = Buffer.from('compressed-pdf-bytes-shorter-than-original');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(compressedBytes.buffer.slice(
        compressedBytes.byteOffset,
        compressedBytes.byteOffset + compressedBytes.byteLength,
      )),
    }));

    const { compressPdfViaCloudConvert } = await import('@/lib/compress/cloudconvert');
    const input = Buffer.alloc(1024 * 100); // 100 KB "PDF"
    const result = await compressPdfViaCloudConvert(input, { quality: 'ebook' });

    expect(result.jobId).toBe('job-123');
    expect(result.originalBytes).toBe(input.length);
    expect(result.compressedBytes).toBe(compressedBytes.length);
    expect(result.ratio).toBe(compressedBytes.length / input.length);
    expect(mockCC.jobs.create).toHaveBeenCalledTimes(1);
    expect(mockCC.jobs.wait).toHaveBeenCalledWith('job-123');
    expect(mockCC.tasks.upload).toHaveBeenCalledTimes(1);
  });

  it('throws when CC job has a failed task', async () => {
    process.env.CLOUDCONVERT_API_KEY = 'ck_test_dummy';

    const mockCC = {
      jobs: {
        create: vi.fn().mockResolvedValue({
          id: 'job-456',
          tasks: [{ name: 'upload-input', result: { form: { url: 'x', parameters: {} } } }],
        }),
        wait: vi.fn().mockResolvedValue({
          id: 'job-456',
          tasks: [
            { name: 'upload-input',  status: 'finished' },
            { name: 'optimize-pdf',  status: 'error', message: 'Source PDF is encrypted' },
            { name: 'export-result', status: 'pending' },
          ],
        }),
      },
      tasks: { upload: vi.fn().mockResolvedValue(undefined) },
    };
    vi.doMock('cloudconvert', () => ({ default: class { constructor() { Object.assign(this, mockCC); } } }));

    const { compressPdfViaCloudConvert } = await import('@/lib/compress/cloudconvert');
    await expect(compressPdfViaCloudConvert(Buffer.from('x')))
      .rejects.toThrow(/CloudConvert job failed.*encrypted/);
  });

  it('throws when CC job is missing the upload-input task entirely', async () => {
    process.env.CLOUDCONVERT_API_KEY = 'ck_test_dummy';

    const mockCC = {
      jobs: {
        create: vi.fn().mockResolvedValue({
          id: 'job-789',
          tasks: [
            // No 'upload-input' task at all — simulating CC returning a malformed job
            { name: 'optimize-pdf' },
          ],
        }),
      },
      tasks: { upload: vi.fn() },
    };
    vi.doMock('cloudconvert', () => ({ default: class { constructor() { Object.assign(this, mockCC); } } }));

    const { compressPdfViaCloudConvert } = await import('@/lib/compress/cloudconvert');
    await expect(compressPdfViaCloudConvert(Buffer.from('x')))
      .rejects.toThrow(/did not return an upload task/);
  });

  it('maps user-facing quality presets to CC profile names', async () => {
    process.env.CLOUDCONVERT_API_KEY = 'ck_test_dummy';

    const createSpy = vi.fn().mockResolvedValue({
      id: 'job-X', tasks: [{ name: 'upload-input', result: { form: { url: 'x', parameters: {} } } }],
    });
    const mockCC = {
      jobs: {
        create: createSpy,
        wait:   vi.fn().mockResolvedValue({
          id: 'job-X',
          tasks: [
            { name: 'upload-input',  status: 'finished' },
            { name: 'optimize-pdf',  status: 'finished' },
            { name: 'export-result', status: 'finished', result: { files: [{ url: 'https://cc.test/r.pdf' }] } },
          ],
        }),
      },
      tasks: { upload: vi.fn().mockResolvedValue(undefined) },
    };
    vi.doMock('cloudconvert', () => ({ default: class { constructor() { Object.assign(this, mockCC); } } }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    }));

    const { compressPdfViaCloudConvert } = await import('@/lib/compress/cloudconvert');
    await compressPdfViaCloudConvert(Buffer.from('x'), { quality: 'screen' });

    // Verify the SDK was called with the CC profile name (not user-facing one)
    const callArgs = createSpy.mock.calls[0][0];
    expect(callArgs.tasks['optimize-pdf'].profile).toBe('max');     // 'screen' → 'max'
  });

  it('falls back to "web" profile for unknown quality', async () => {
    process.env.CLOUDCONVERT_API_KEY = 'ck_test_dummy';

    const createSpy = vi.fn().mockResolvedValue({
      id: 'job-Y', tasks: [{ name: 'upload-input', result: { form: { url: 'x', parameters: {} } } }],
    });
    const mockCC = {
      jobs: { create: createSpy, wait: vi.fn().mockResolvedValue({ id: 'job-Y', tasks: [
        { name: 'upload-input',  status: 'finished' },
        { name: 'optimize-pdf',  status: 'finished' },
        { name: 'export-result', status: 'finished', result: { files: [{ url: 'x' }] } },
      ] }) },
      tasks: { upload: vi.fn() },
    };
    vi.doMock('cloudconvert', () => ({ default: class { constructor() { Object.assign(this, mockCC); } } }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }));

    const { compressPdfViaCloudConvert } = await import('@/lib/compress/cloudconvert');
    // default quality (no arg) should be 'ebook' → CC profile 'web'
    await compressPdfViaCloudConvert(Buffer.from('x'));
    expect(createSpy.mock.calls[0][0].tasks['optimize-pdf'].profile).toBe('web');
  });
});
