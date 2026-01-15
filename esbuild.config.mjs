import * as esbuild from 'esbuild';

const commonOptions = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  minify: true,
  sourcemap: false,
};

// Parse command line arguments to allow individual builds
const args = process.argv.slice(2);
const buildGha = args.includes('--gha') || args.length === 0;
const buildCli = args.includes('--cli') || args.length === 0;
const buildCjsLib = args.includes('--cjslib') || args.length === 0;

const builds = [];

// GitHub Actions bundle
if (buildGha) {
  builds.push(
    esbuild.build({
      ...commonOptions,
      entryPoints: ['src/action/index.ts'],
      outfile: 'dist/action/index.cjs',
      format: 'cjs',
    }).then(() => console.log('Built: dist/action/index.cjs'))
  );
}

// CLI bundle - used by Terraform module and can be run directly with node
if (buildCli) {
  builds.push(
    esbuild.build({
      ...commonOptions,
      entryPoints: ['src/cli.ts'],
      outfile: 'dist/cli/index.cjs',
      format: 'cjs',
    }).then(() => console.log('Built: dist/cli/index.cjs'))
  );
}

// Library CJS bundle - for require() consumers
if (buildCjsLib) {
  builds.push(
    esbuild.build({
      ...commonOptions,
      entryPoints: ['src/index.ts'],
      outfile: 'dist/cjs/index.cjs',
      format: 'cjs',
    }).then(() => console.log('Built: dist/cjs/index.cjs'))
  );
}

await Promise.all(builds);
console.log('Build complete');
