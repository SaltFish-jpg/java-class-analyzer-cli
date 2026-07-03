# java-class-analyzer-cli

[English](README.md) | 简体中文

本项目源自 [handsomestWei/java-class-analyzer-mcp-server](https://github.com/handsomestWei/java-class-analyzer-mcp-server)，是其 CLI 版本，感谢原作者的开源贡献。

`java-class-analyzer-cli` 是一个项目级 Java 依赖类分析工具。它的目标是像 `maven-indexer-cli` 一样安装后即可在命令行使用，不需要额外配置 MCP，同时更适合项目组在具体 Java 项目里分析依赖类、方法签名和反编译源码。

## 安装

```bash
npm install -g java-class-analyzer-cli
```

从源码安装：

```bash
npm install
npm run build
npm link
```

## 常用命令

```bash
java-class-analyzer-cli scan --project .
java-class-analyzer-cli search-classes --project . Foo
java-class-analyzer-cli get-class --project . com.foo.Bar --type source
java-class-analyzer-cli get-class --project . com.foo.Bar --type signatures
java-class-analyzer-cli analyze-class --project . com.foo.Bar --json
```

## 工作原理

`scan` 会在目标项目目录中执行 Maven 命令，获取项目最终解析出的 classpath：

```bash
mvn -q dependency:build-classpath -Dmdep.outputFile=.java-class-analyzer/classpath.txt
```

随后它只扫描该 classpath 中列出的 jar，并写入项目级索引：

```text
.java-class-analyzer/class-index.json
```

索引条目包含：

- 类全名
- jar 路径
- 尽量推断出的 Maven 坐标
- classpath 顺序
- jar 的 mtime 和 size

如果多个 classpath jar 中包含同一个类，默认选择 classpath 顺序最靠前的 jar，并在命令输出中提示冲突。

## 缓存目录

```text
.java-class-analyzer/
  classpath.txt
  class-index.json
  class-temp/
  decompile-cache/<jarFingerprint>/com/foo/Bar.java
```

反编译缓存会绑定 jar 指纹，而不是只按 className 缓存。因此项目升级依赖后，即使类名相同，也不会读到旧版本 jar 的反编译结果。

## CFR

CLI 会按以下顺序查找 CFR：

1. `--cfr-path`
2. `CFR_PATH`
3. `lib/cfr-0.152.jar`

打包前可以把 `cfr-0.152.jar` 放到 `lib/` 目录下；也可以通过 `CFR_PATH` 指向已有的 CFR jar。

当前包内置了 MIT 许可证下的 CFR 0.152，详见 `THIRD_PARTY_NOTICES.md`。

## Maven 选项

可能触发扫描的命令支持这些选项：

```bash
--settings path/to/settings.xml
--scope compile
--maven-args -DskipTests -Pdev
--auto-scan
```

`search-classes`、`get-class`、`analyze-class` 默认不会静默自动扫描。如果索引不存在，请先执行 `scan`，或显式添加 `--auto-scan`。

## 和 maven-indexer-cli 的区别

`maven-indexer-cli` 面向全局 Maven/Gradle 仓库索引，适合回答“这台机器上有哪些依赖类？”。

`java-class-analyzer-cli` 面向当前项目最终解析出的 classpath，适合回答“这个项目实际使用的是哪个依赖类、哪个版本？”。
