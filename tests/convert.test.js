const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

describe('convert command', () => {
  const cliPath = path.join(__dirname, '..', 'cli.js');
  let tempDir;

  beforeEach(() => {
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'convert-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('should convert JSON5 to JSON and output to stdout', () => {
    const inputFile = path.join(tempDir, 'input.json5');
    const json5Content = `{
      // This is a comment
      name: 'test',
      version: 1,
      features: ['feature1', 'feature2'],
    }`;

    fs.writeFileSync(inputFile, json5Content, 'utf8');

    const result = execSync(`node ${cliPath} convert "${inputFile}"`, {
      encoding: 'utf8'
    });

    const parsed = JSON.parse(result);
    expect(parsed.name).toBe('test');
    expect(parsed.version).toBe(1);
    expect(parsed.features).toEqual(['feature1', 'feature2']);
  });

  test('should convert JSON5 to JSON and write to file', () => {
    const inputFile = path.join(tempDir, 'input.json5');
    const outputFile = path.join(tempDir, 'output.json');
    const json5Content = `{
      name: 'test',
      value: 42
    }`;

    fs.writeFileSync(inputFile, json5Content, 'utf8');

    execSync(`node ${cliPath} convert "${inputFile}" "${outputFile}"`, {
      encoding: 'utf8'
    });

    expect(fs.existsSync(outputFile)).toBe(true);
    const outputContent = fs.readFileSync(outputFile, 'utf8');
    const parsed = JSON.parse(outputContent);

    expect(parsed.name).toBe('test');
    expect(parsed.value).toBe(42);
  });

  test('should pretty-print JSON by default', () => {
    const inputFile = path.join(tempDir, 'input.json5');
    const json5Content = `{ name: 'test', nested: { value: 1 } }`;

    fs.writeFileSync(inputFile, json5Content, 'utf8');

    const result = execSync(`node ${cliPath} convert "${inputFile}"`, {
      encoding: 'utf8'
    });

    // Pretty-printed JSON should have newlines and indentation
    expect(result).toContain('\n');
    expect(result).toContain('  ');
  });

  test('should minify JSON when --minify flag is used', () => {
    const inputFile = path.join(tempDir, 'input.json5');
    const json5Content = `{
      name: 'test',
      nested: {
        value: 1,
        array: [1, 2, 3]
      }
    }`;

    fs.writeFileSync(inputFile, json5Content, 'utf8');

    const result = execSync(`node ${cliPath} convert "${inputFile}" --minify`, {
      encoding: 'utf8'
    });

    // Minified JSON should be on a single line (plus trailing newline)
    expect(result.trim().split('\n').length).toBe(1);

    // But should still be valid JSON
    const parsed = JSON.parse(result);
    expect(parsed.name).toBe('test');
    expect(parsed.nested.value).toBe(1);
    expect(parsed.nested.array).toEqual([1, 2, 3]);
  });

  test('should handle JSON5 comments', () => {
    const inputFile = path.join(tempDir, 'input.json5');
    const json5Content = `{
      // Single line comment
      name: 'test',
      /* Multi-line
         comment */
      value: 42
    }`;

    fs.writeFileSync(inputFile, json5Content, 'utf8');

    const result = execSync(`node ${cliPath} convert "${inputFile}"`, {
      encoding: 'utf8'
    });

    const parsed = JSON.parse(result);
    expect(parsed.name).toBe('test');
    expect(parsed.value).toBe(42);
  });

  test('should handle JSON5 trailing commas', () => {
    const inputFile = path.join(tempDir, 'input.json5');
    const json5Content = `{
      name: 'test',
      items: [1, 2, 3,],
      nested: {
        a: 1,
        b: 2,
      },
    }`;

    fs.writeFileSync(inputFile, json5Content, 'utf8');

    const result = execSync(`node ${cliPath} convert "${inputFile}"`, {
      encoding: 'utf8'
    });

    const parsed = JSON.parse(result);
    expect(parsed.name).toBe('test');
    expect(parsed.items).toEqual([1, 2, 3]);
    expect(parsed.nested).toEqual({ a: 1, b: 2 });
  });

  test('should handle JSON5 unquoted keys', () => {
    const inputFile = path.join(tempDir, 'input.json5');
    const json5Content = `{
      unquotedKey: 'value',
      another_key: 123,
      yetAnotherKey: true
    }`;

    fs.writeFileSync(inputFile, json5Content, 'utf8');

    const result = execSync(`node ${cliPath} convert "${inputFile}"`, {
      encoding: 'utf8'
    });

    const parsed = JSON.parse(result);
    expect(parsed.unquotedKey).toBe('value');
    expect(parsed.another_key).toBe(123);
    expect(parsed.yetAnotherKey).toBe(true);
  });

  test('should handle JSON5 single-quoted strings', () => {
    const inputFile = path.join(tempDir, 'input.json5');
    const json5Content = `{
      singleQuoted: 'value',
      doubleQuoted: "value",
      mixed: 'single and "double"'
    }`;

    fs.writeFileSync(inputFile, json5Content, 'utf8');

    const result = execSync(`node ${cliPath} convert "${inputFile}"`, {
      encoding: 'utf8'
    });

    const parsed = JSON.parse(result);
    expect(parsed.singleQuoted).toBe('value');
    expect(parsed.doubleQuoted).toBe('value');
    expect(parsed.mixed).toBe('single and "double"');
  });

  test('should handle complex nested structures', () => {
    const inputFile = path.join(tempDir, 'input.json5');
    const json5Content = `{
      level1: {
        level2: {
          level3: {
            value: 'deep',
            array: [
              { id: 1, name: 'item1' },
              { id: 2, name: 'item2' },
            ]
          }
        }
      }
    }`;

    fs.writeFileSync(inputFile, json5Content, 'utf8');

    const result = execSync(`node ${cliPath} convert "${inputFile}"`, {
      encoding: 'utf8'
    });

    const parsed = JSON.parse(result);
    expect(parsed.level1.level2.level3.value).toBe('deep');
    expect(parsed.level1.level2.level3.array).toHaveLength(2);
    expect(parsed.level1.level2.level3.array[0].id).toBe(1);
  });

  test('should convert existing test-cfg.json5 file', () => {
    const testConfigPath = path.join(__dirname, '..', 'test-cfg.json5');
    const result = execSync(`node ${cliPath} convert ${testConfigPath}`, {
      encoding: 'utf8'
    });

    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('defaults');
    expect(parsed).toHaveProperty('environments');
    expect(parsed.environments).toHaveProperty('dev');
    expect(parsed.environments).toHaveProperty('ephemeral');
  });

  test('should throw error for non-existent input file', () => {
    const nonExistentFile = path.join(tempDir, 'does-not-exist.json5');

    expect(() => {
      execSync(`node ${cliPath} convert "${nonExistentFile}"`, {
        encoding: 'utf8',
        stdio: 'pipe'
      });
    }).toThrow();
  });

  test('should throw error for invalid JSON5 content', () => {
    const inputFile = path.join(tempDir, 'invalid.json5');
    const invalidContent = `{
      this is not valid JSON5 at all
    }`;

    fs.writeFileSync(inputFile, invalidContent, 'utf8');

    expect(() => {
      execSync(`node ${cliPath} convert "${inputFile}"`, {
        encoding: 'utf8',
        stdio: 'pipe'
      });
    }).toThrow();
  });

  test('should write output file with proper formatting', () => {
    const inputFile = path.join(tempDir, 'input.json5');
    const outputFile = path.join(tempDir, 'output.json');
    const json5Content = `{ name: 'test', value: 123 }`;

    fs.writeFileSync(inputFile, json5Content, 'utf8');

    execSync(`node ${cliPath} convert "${inputFile}" "${outputFile}"`, {
      encoding: 'utf8'
    });

    const outputContent = fs.readFileSync(outputFile, 'utf8');

    // Should be pretty-printed
    expect(outputContent).toContain('\n');
    expect(outputContent).toContain('  ');

    // Should end with newline
    expect(outputContent.endsWith('\n')).toBe(true);
  });

  test('should write minified output to file when --minify is used', () => {
    const inputFile = path.join(tempDir, 'input.json5');
    const outputFile = path.join(tempDir, 'output.json');
    const json5Content = `{
      name: 'test',
      nested: { value: 1 }
    }`;

    fs.writeFileSync(inputFile, json5Content, 'utf8');

    execSync(`node ${cliPath} convert "${inputFile}" "${outputFile}" --minify`, {
      encoding: 'utf8'
    });

    const outputContent = fs.readFileSync(outputFile, 'utf8');

    // Should be minified (only one line plus trailing newline)
    expect(outputContent.split('\n').length).toBe(2);
    expect(outputContent.trim().split('\n').length).toBe(1);

    // But still valid JSON
    const parsed = JSON.parse(outputContent);
    expect(parsed.name).toBe('test');
    expect(parsed.nested.value).toBe(1);
  });

  test('should handle arrays at root level', () => {
    const inputFile = path.join(tempDir, 'input.json5');
    const json5Content = `[
      { id: 1, name: 'item1' },
      { id: 2, name: 'item2' },
    ]`;

    fs.writeFileSync(inputFile, json5Content, 'utf8');

    const result = execSync(`node ${cliPath} convert "${inputFile}"`, {
      encoding: 'utf8'
    });

    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].id).toBe(1);
  });

  test('should handle various JSON5 number formats', () => {
    const inputFile = path.join(tempDir, 'input.json5');
    const json5Content = `{
      hex: 0xFF,
      positive: +42,
      negative: -42,
      decimal: 3.14,
      infinity: Infinity,
      negInfinity: -Infinity
    }`;

    fs.writeFileSync(inputFile, json5Content, 'utf8');

    const result = execSync(`node ${cliPath} convert "${inputFile}"`, {
      encoding: 'utf8'
    });

    const parsed = JSON.parse(result);
    expect(parsed.hex).toBe(255);
    expect(parsed.positive).toBe(42);
    expect(parsed.negative).toBe(-42);
    expect(parsed.decimal).toBe(3.14);
    expect(parsed.infinity).toBe(null); // Infinity becomes null in JSON
    expect(parsed.negInfinity).toBe(null); // -Infinity becomes null in JSON
  });

  test('should show help for convert command', () => {
    const result = execSync(`node ${cliPath} convert --help`, {
      encoding: 'utf8'
    });

    expect(result).toContain('Convert JSON5 file to standard JSON');
    expect(result).toContain('input');
    expect(result).toContain('output');
    expect(result).toContain('--minify');
  });

  test('should handle file paths with spaces', () => {
    const inputFile = path.join(tempDir, 'input with spaces.json5');
    const outputFile = path.join(tempDir, 'output with spaces.json');
    const json5Content = `{ name: 'test' }`;

    fs.writeFileSync(inputFile, json5Content, 'utf8');

    execSync(`node ${cliPath} convert "${inputFile}" "${outputFile}"`, {
      encoding: 'utf8'
    });

    expect(fs.existsSync(outputFile)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    expect(parsed.name).toBe('test');
  });
});
