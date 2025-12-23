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
const buildTerraform = args.includes('--terraform') || args.length === 0;
const buildPackage = args.includes('--package') || args.length === 0;

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

// Terraform bundle
if (buildTerraform) {
  builds.push(
    esbuild.build({
      ...commonOptions,
      entryPoints: ['src/lib/merge-config.ts'],
      outfile: 'dist/terraform/index.cjs',
      format: 'cjs',
    }).then(() => console.log('Built: dist/terraform/index.cjs'))
  );
}

// Package distribution bundle (CJS for require() consumers)
if (buildPackage) {
  builds.push(
    esbuild.build({
      ...commonOptions,
      entryPoints: ['src/lib/merge-config.ts'],
      outfile: 'dist/cjs/index.cjs',
      format: 'cjs',
    }).then(() => console.log('Built: dist/cjs/index.cjs'))
  );
}

await Promise.all(builds);
console.log('Build complete');
