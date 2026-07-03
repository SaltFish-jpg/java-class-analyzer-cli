# java-class-analyzer-cli

`java-class-analyzer-cli` is a project-scoped Java dependency analyzer. It is meant to be installed as a normal command-line tool, like `maven-indexer-cli`, without requiring MCP configuration.

The main design point is version accuracy. If the local Maven repository contains `demo-lib` versions `1.2`, `1.3`, and `1.4`, but the current project resolves `1.3`, this CLI indexes and decompiles only the jars from the current project's final classpath.

## Install

```bash
npm install -g java-class-analyzer-cli
```

From source:

```bash
npm install
npm run build
npm link
```

## Commands

```bash
java-class-analyzer-cli scan --project .
java-class-analyzer-cli search-classes --project . Foo
java-class-analyzer-cli get-class --project . com.foo.Bar --type source
java-class-analyzer-cli get-class --project . com.foo.Bar --type signatures
java-class-analyzer-cli analyze-class --project . com.foo.Bar --json
```

## How It Works

`scan` runs Maven in the target project:

```bash
mvn -q dependency:build-classpath -Dmdep.outputFile=.java-class-analyzer/classpath.txt
```

It then scans only the jars listed in that resolved classpath and writes:

```text
.java-class-analyzer/class-index.json
```

Index entries include:

- class name
- jar path
- best-effort Maven coordinate
- classpath order
- jar mtime and size

If multiple classpath jars contain the same class, the first jar by classpath order is selected by default and the command reports the conflict.

## Cache Layout

```text
.java-class-analyzer/
  classpath.txt
  class-index.json
  class-temp/
  decompile-cache/<jarFingerprint>/com/foo/Bar.java
```

The decompile cache is keyed by a jar fingerprint, not just by class name, so upgrading a dependency does not reuse stale decompiled source.

## CFR

The CLI looks for CFR in this order:

1. `--cfr-path`
2. `CFR_PATH`
3. `lib/cfr-0.152.jar`

Put `cfr-0.152.jar` under `lib/` before packaging, or set `CFR_PATH` to an existing CFR jar.

This package bundles CFR 0.152 under the MIT license. See `THIRD_PARTY_NOTICES.md`.

## Maven Options

These options are available on commands that may scan:

```bash
--settings path/to/settings.xml
--scope compile
--maven-args -DskipTests -Pdev
--auto-scan
```

`search-classes`, `get-class`, and `analyze-class` do not silently scan by default. If the index is missing, run `scan` first or add `--auto-scan`.

## Compared With maven-indexer-cli

`maven-indexer-cli` indexes the global Maven/Gradle repositories and is good for answering "what dependency classes exist on this machine?"

`java-class-analyzer-cli` indexes the current project's resolved classpath and is good for answering "which dependency class and version is this project actually using?"
