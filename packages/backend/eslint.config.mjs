import { config } from '@repo/eslint-config/base'

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      /**
       * Unused FUNCTION ARGUMENTS are allowed; unused locals and imports are
       * still flagged.
       *
       * This is a concession to the unimplemented stubs: every `Not implemented`
       * function declares the parameters it will use, and flagging all of them
       * would bury real findings under 40 lines of noise. Unused locals and
       * imports — the ones that actually indicate dead code — stay on.
       *
       * Once the stubs are filled in, delete this block and let the base config
       * enforce the strict version again.
       */
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { args: 'none', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      /**
       * The rule that keeps this a MODULAR monolith rather than just an
       * undivided one: a module may import another module's public barrel
       * (modules/x/index.ts), never its internals.
       *
       * Without this the boundary is a convention, and conventions lose. With
       * it, the "when would you split this into services?" answer becomes
       * credible, because the coupling is actually controlled.
       */
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                // Absolute-ish paths into another module's internals.
                '**/modules/*/*.service',
                '**/modules/*/*.repository',
                '**/modules/*/*.controller',
                '**/modules/*/*.schema',
                // The sibling form: ../otherModule/otherModule.service.js
                '../*/*.service',
                '../*/*.repository',
                '../*/*.controller',
                '../*/*.schema',
              ],
              message:
                'Import a module through its index.ts barrel, not its internals. Within your own module, use a relative path (./x.service.js).',
            },
          ],
        },
      ],
    },
  },
]
