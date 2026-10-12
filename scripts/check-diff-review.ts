// Autoteste do módulo diffReview: categorização cognitiva e parsing de diff.
// node scripts/check-diff-review.ts

import assert from 'node:assert/strict'
import {
  categorizeFilePath,
  parseUnifiedDiff,
  groupDiffByCategory,
  CATEGORY_ORDER,
  type ParsedFileDiff,
} from '../src/features/factory/diffReview.ts'

// 1. Categorização de caminhos (heurísticas cognitivas)
assert.equal(categorizeFilePath('server/lib/factory/gates.ts'), 'core')
assert.equal(categorizeFilePath('src/features/factory/TaskReviewDrawer.tsx'), 'core')
assert.equal(categorizeFilePath('src/domain/entities/order.py'), 'core')
assert.equal(categorizeFilePath('src/main/java/com/app/model/User.java'), 'core')

assert.equal(categorizeFilePath('server/routes/factory.ts'), 'wiring')
assert.equal(categorizeFilePath('server/index.ts'), 'wiring')
assert.equal(categorizeFilePath('src/app/nav.ts'), 'wiring')
assert.equal(categorizeFilePath('src/api/client.ts'), 'wiring')
assert.equal(categorizeFilePath('app/controllers/user_controller.py'), 'wiring')
assert.equal(categorizeFilePath('src/main/java/com/app/controller/ApiController.java'), 'wiring')

assert.equal(categorizeFilePath('tests/test_gates.py'), 'tests')
assert.equal(categorizeFilePath('src/features/factory/__tests__/drawer.test.tsx'), 'tests')
assert.equal(categorizeFilePath('src/domain/user.spec.ts'), 'tests')
assert.equal(categorizeFilePath('src/test/java/com/app/UserTest.java'), 'tests')
assert.equal(categorizeFilePath('pkg/auth/token_test.go'), 'tests')
assert.equal(categorizeFilePath('scripts/check-factory-pipeline.ts'), 'tests')

assert.equal(categorizeFilePath('docs/fabrica.md'), 'docs_meta')
assert.equal(categorizeFilePath('README.md'), 'docs_meta')
assert.equal(categorizeFilePath('package.json'), 'docs_meta')
assert.equal(categorizeFilePath('tsconfig.json'), 'docs_meta')
assert.equal(categorizeFilePath('Dockerfile'), 'docs_meta')
assert.equal(categorizeFilePath('.gitlab-ci.yml'), 'docs_meta')
assert.equal(categorizeFilePath('deploy/helm/values.yaml'), 'docs_meta')

// 2. Parsing de diff unificado com múltiplos arquivos
const sampleDiff = `diff --git a/docs/guide.md b/docs/guide.md
index 111..222 100644
--- a/docs/guide.md
+++ b/docs/guide.md
@@ -1,3 +1,4 @@
 # Guide
+New section
 Existing content
diff --git a/server/routes/api.ts b/server/routes/api.ts
index 333..444 100644
--- a/server/routes/api.ts
+++ b/server/routes/api.ts
@@ -10,5 +10,6 @@
 import express from 'express'
+router.get('/health', ok)
 export default router
diff --git a/server/lib/core.ts b/server/lib/core.ts
index 555..666 100644
--- a/server/lib/core.ts
+++ b/server/lib/core.ts
@@ -20,4 +20,3 @@
-const oldLogic = 1
+const newLogic = 2
 return newLogic
diff --git a/tests/core.test.ts b/tests/core.test.ts
new file mode 100644
index 000..777
--- /dev/null
+++ b/tests/core.test.ts
@@ -0,0 +1,5 @@
+import assert from 'assert'
+assert.ok(true)
`

const parsed = parseUnifiedDiff(sampleDiff)
assert.equal(parsed.length, 4)

// 3. Ordem cognitiva estrita: Core -> Wiring -> Tests -> Docs & Meta
assert.deepEqual(
  parsed.map(f => f.path),
  [
    'server/lib/core.ts',        // core
    'server/routes/api.ts',      // wiring
    'tests/core.test.ts',        // tests
    'docs/guide.md',             // docs_meta
  ],
)

// 4. Detalhes do arquivo core
const coreFile = parsed[0]
assert.equal(coreFile.category, 'core')
assert.equal(coreFile.insertions, 1)
assert.equal(coreFile.deletions, 1)
assert.equal(coreFile.isNew, false)
assert.equal(coreFile.isDeleted, false)

// Verifica tipos de linha do diff
const addLine = coreFile.lines.find(l => l.type === 'add')
assert.ok(addLine)
assert.equal(addLine.text, 'const newLogic = 2')
assert.equal(addLine.newLineNumber, 20)

const delLine = coreFile.lines.find(l => l.type === 'del')
assert.ok(delLine)
assert.equal(delLine.text, 'const oldLogic = 1')
assert.equal(delLine.oldLineNumber, 20)

// 5. Arquivo novo
const testFile = parsed[2]
assert.equal(testFile.path, 'tests/core.test.ts')
assert.equal(testFile.category, 'tests')
assert.equal(testFile.isNew, true)
assert.equal(testFile.insertions, 2)
assert.equal(testFile.deletions, 0)

// 6. Agrupamento por categoria
const grouped = groupDiffByCategory(parsed)
assert.equal(grouped.core.length, 1)
assert.equal(grouped.wiring.length, 1)
assert.equal(grouped.tests.length, 1)
assert.equal(grouped.docs_meta.length, 1)

// 7. Arquivo deletado
const delDiff = `diff --git a/server/old.ts b/server/old.ts
deleted file mode 100644
index 111..000
--- a/server/old.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-line1
-line2
-line3`
const parsedDel = parseUnifiedDiff(delDiff)
assert.equal(parsedDel.length, 1)
assert.equal(parsedDel[0].path, 'server/old.ts')
assert.equal(parsedDel[0].isDeleted, true)
assert.equal(parsedDel[0].deletions, 3)

// 8. Diff vazio
assert.deepEqual(parseUnifiedDiff(''), [])
assert.deepEqual(parseUnifiedDiff('   \n  '), [])

console.log('check-diff-review: ok (heurísticas, parsing, ordenação cognitiva e contadores)')
