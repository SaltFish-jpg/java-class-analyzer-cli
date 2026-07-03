---
name: java-class-analyzer
description: 项目级 Java classpath 依赖类分析工具。用于在 Maven Java 项目中看到 import 或类引用但工作区找不到源码时，按当前项目最终解析出的 classpath 精确查找依赖类；用于查看依赖类的方法签名、反编译源码、字段、方法、父类和接口。当前项目依赖版本准确性优先时，优先使用本 skill，而不是全局 Maven 仓库搜索。标准 Java 类、工作区已有源码、或全局 artifact/resource 搜索任务不要使用。
---

# Java Class Analyzer CLI

使用 `java-class-analyzer-cli` 查看当前 Maven 项目已解析 classpath 中的依赖类、方法签名、javap 结构和反编译源码。

这个 CLI 是项目级工具。始终通过 `--project` 指定项目根目录；如果用户关心当前项目的真实依赖版本，不要扫描整个本地 Maven 仓库。

## 何时使用

**使用这个 skill：**

- 看到 `com.company.util.Helper` 这类 import，但工作区里找不到源码
- 需要阅读当前项目实际使用的编译后依赖类实现
- 需要查看依赖类的方法签名、字段、父类、接口或完整反编译源码
- 需要知道当前 Maven classpath 上哪个 jar、哪个版本提供了某个类
- 本地 Maven 仓库可能有多个版本，且当前项目版本准确性很重要

**不要使用这个 skill：**

- 类来自标准 Java 库，例如 `java.util`、`java.io`，或源码已经在工作区中
- 任务是搜索整个本地 Maven/Gradle 缓存里的 artifact、资源、proto 文件或实现类
- 当前项目不是 Maven 项目，除非已经有可用的项目索引

如果找不到 `java-class-analyzer-cli`，先安装 CLI：

```bash
npm install -g java-class-analyzer-cli
```

## 先检查索引

优先使用当前仓库根目录作为 `--project`。如果 `.java-class-analyzer/class-index.json` 不存在或可能过期，先构建或刷新索引：

```bash
java-class-analyzer-cli scan --project .
```

只有在可以自动运行 Maven 时才使用 `--auto-scan`；否则先询问用户，或提示用户执行 `scan`。

## 命令

### `search-classes` - 在当前项目 classpath 上查找类

```bash
java-class-analyzer-cli search-classes --project . <className>
# 示例：
java-class-analyzer-cli search-classes --project . StringUtils
java-class-analyzer-cli search-classes --project . com.company.util.Helper
java-class-analyzer-cli search-classes --project . JsonToXml
```

### `get-class` - 查看签名或反编译源码

需要了解依赖行为时，优先读取真实实现，不要猜。

```bash
# 完整反编译源码
java-class-analyzer-cli get-class --project . com.foo.Bar --type source

# 方法和字段签名
java-class-analyzer-cli get-class --project . com.foo.Bar --type signatures
```

### `analyze-class` - 获取结构化 javap 分析

```bash
java-class-analyzer-cli analyze-class --project . com.foo.Bar
java-class-analyzer-cli analyze-class --project . com.foo.Bar --json
```

## 输出

需要程序化消费结果时使用 `--json`：

```bash
java-class-analyzer-cli search-classes --project . Foo --json
java-class-analyzer-cli get-class --project . com.foo.Bar --type source --json
java-class-analyzer-cli analyze-class --project . com.foo.Bar --json
```

## 注意事项

- CLI 使用 `mvn dependency:build-classpath` 解析当前 Maven 项目的最终 classpath。
- 只索引该 classpath 中的 jar，并保留 classpath 顺序。
- 如果多个 jar 含有同一个类，使用 classpath 顺序最靠前的结果，并向用户说明存在冲突。
- 反编译源码缓存绑定 jar 指纹，依赖升级后不会因为 className 相同而复用旧源码。
- 如果需要全局 artifact/resource 搜索，应改用全局 Maven/Gradle 仓库索引工具。
