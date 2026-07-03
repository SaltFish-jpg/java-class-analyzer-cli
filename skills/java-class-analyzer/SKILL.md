---
name: java-class-analyzer
description: Project-scoped Java classpath analyzer for dependency classes. Use when you see an import or class reference in a Maven Java project but cannot find its source in the workspace, need the exact dependency version actually used by the current project classpath, need method signatures or decompiled source for a dependency class, or need javap-style fields/methods/superclass/interface analysis. Prefer this over global Maven repository search when current-project version accuracy matters. Do not use for standard Java classes, when source is already present in the workspace, or when the task is global artifact/resource discovery rather than current-project classpath analysis.
---

# Java Class Analyzer CLI

Use `java-class-analyzer-cli` to inspect dependency classes, method signatures, javap structure, and decompiled source from the current Maven project's resolved classpath.

This CLI is project-scoped. Always pass the project root with `--project`; do not scan the whole local Maven repository when the user needs accuracy for the current project dependency graph.

## When to activate

**Use this skill when:**

- You see an import such as `com.company.util.Helper` but cannot find the source in the workspace
- You need to read the implementation of a compiled dependency class used by this project
- You need method signatures, fields, superclass, interfaces, or full decompiled source for a dependency class
- You need to know which jar/version on the current Maven classpath provides a class
- The local Maven repository may contain multiple versions and current-project version accuracy matters

**Skip when:**

- The class is from standard Java (`java.util`, `java.io`, etc.) or source is already in the workspace
- The task is to search all locally cached artifacts, resources, proto files, or implementations across the whole Maven/Gradle cache
- The current project is not Maven-based, unless the CLI has already been given a valid project index

If `java-class-analyzer-cli` is not found, install it first:

```bash
npm install -g java-class-analyzer-cli
```

## Check index first

Prefer the current repository root as `--project`. If `.java-class-analyzer/class-index.json` is missing or stale, build or refresh it:

```bash
java-class-analyzer-cli scan --project .
```

Use `--auto-scan` only when it is acceptable to run Maven automatically for the project. Otherwise ask the user or tell them to run `scan`.

## Commands

### `search-classes` - Find a class on the current project classpath

```bash
java-class-analyzer-cli search-classes --project . <className>
# Examples:
java-class-analyzer-cli search-classes --project . StringUtils
java-class-analyzer-cli search-classes --project . com.company.util.Helper
java-class-analyzer-cli search-classes --project . JsonToXml
```

### `get-class` - Read signatures or decompiled source

Use this instead of guessing dependency behavior.

```bash
# Full decompiled source
java-class-analyzer-cli get-class --project . com.foo.Bar --type source

# Method and field signatures
java-class-analyzer-cli get-class --project . com.foo.Bar --type signatures
```

### `analyze-class` - Get structured javap analysis

```bash
java-class-analyzer-cli analyze-class --project . com.foo.Bar
java-class-analyzer-cli analyze-class --project . com.foo.Bar --json
```

## Output

Use `--json` when the result will be consumed programmatically:

```bash
java-class-analyzer-cli search-classes --project . Foo --json
java-class-analyzer-cli get-class --project . com.foo.Bar --type source --json
java-class-analyzer-cli analyze-class --project . com.foo.Bar --json
```

## Notes

- The CLI resolves the current Maven project's final classpath using `mvn dependency:build-classpath`.
- It indexes only jars on that classpath, preserving classpath order.
- If more than one jar contains the same class, use the classpath-first result and mention the conflict.
- Decompiled source cache is tied to a jar fingerprint, so dependency upgrades do not reuse stale source for the same class name.
- If global artifact/resource discovery is needed, use a global Maven/Gradle repository indexer instead.
