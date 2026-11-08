import Foundation

// "Get" for an MCP registry server: adds one entry to <project>/.yana-ai/mcp-servers.json, the only list
// yana-rt reads (capability::mcp_config). The entry runs the server's pinned npm or PyPI package over stdio:
//   npm  -> npx -y <identifier>@<version>
//   pypi -> uvx <identifier>==<version>
// Writing the file does not turn the server on: yana-rt uses it only after a person confirms this exact
// content with `yana-rt trust allow mcp-servers` and types `yes` (a guard kept on purpose so no script or
// agent can confirm for the user). The app opens that step in its own terminal. Every call to the server
// is then still approved per call by yana-rt. The checks here mirror yana-rt's own so a bad entry is
// refused before it is written.

enum McpInstaller {
	static let configPath = ".yana-ai/mcp-servers.json"
	static let maxServers = 32            // yana-rt MAX_SERVERS
	static let maxNameChars = 32          // yana-rt MAX_NAME_CHARS
	static let maxCommandLine = 160       // yana-rt MAX_COMMAND_LINE_CHARS
	static let maxEnvList = 120           // yana-rt MAX_ENV_LIST_CHARS
	// yana-rt refuses these: they change how a program loads code.
	static let loaderVariables: Set<String> = ["PATH", "NODE_OPTIONS", "NODE_PATH", "PYTHONPATH", "PYTHONSTARTUP", "PYTHONINSPECT",
	                                           "BASH_ENV", "ENV", "IFS", "PERL5LIB", "RUBYLIB", "JAVA_TOOL_OPTIONS", "CLASSPATH", "SHELLOPTS"]

	struct Entry: Equatable {
		let name: String
		let command: String
		let args: [String]
		let env: [String]
		var json: [String: Any] { env.isEmpty ? ["name": name, "command": command, "args": args] : ["name": name, "command": command, "args": args, "env": env] }
		var commandLine: String { ([command] + args).joined(separator: " ") }
	}

	enum InstallError: LocalizedError {
		case noPackage, invalid(String), full, unreadable(String)
		var errorDescription: String? {
			switch self {
			case .noPackage: return L("mcp.remoteOnly")
			case .invalid(let why): return why
			case .full: return String(format: L("mcp.full"), maxServers)
			case .unreadable(let why): return "\(configPath): \(why)"
			}
		}
	}

	// "io.github.user/weather-server" -> "weather-server" (a-z, 0-9, -, _; at most 32).
	static func serverName(_ item: StoreItem) -> String {
		let raw = item.id.split(separator: "#").last.map(String.init) ?? item.name
		let last = raw.split(separator: "/").last.map(String.init) ?? raw
		let cleaned = last.lowercased().map { ($0.isASCII && ($0.isLetter || $0.isNumber)) || $0 == "-" || $0 == "_" ? $0 : "-" }
		let name = String(cleaned).trimmingCharacters(in: CharacterSet(charactersIn: "-_"))
		return String((name.isEmpty ? "mcp-server" : name).prefix(maxNameChars))
	}

	static func entry(for item: StoreItem) throws -> Entry {
		guard let package = item.package else { throw InstallError.noPackage }
		let env = package.env.filter { !loaderVariables.contains($0) && !$0.hasPrefix("LD_") && !$0.hasPrefix("DYLD_") }
		let entry = package.registryType == "npm"
			? Entry(name: serverName(item), command: "npx", args: ["-y", "\(package.identifier)@\(package.version)"], env: env)
			: Entry(name: serverName(item), command: "uvx", args: ["\(package.identifier)==\(package.version)"], env: env)
		guard entry.commandLine.count <= maxCommandLine else { throw InstallError.invalid(L("mcp.tooLong")) }
		guard entry.env.joined(separator: ", ").count <= maxEnvList, entry.env.count <= 32 else { throw InstallError.invalid(L("mcp.tooManyVars")) }
		return entry
	}

	static func configURL(_ workspace: String) -> URL {
		URL(fileURLWithPath: workspace).appendingPathComponent(configPath)
	}

	static func servers(in workspace: String) throws -> [[String: Any]] {
		let url = configURL(workspace)
		guard FileManager.default.fileExists(atPath: url.path) else { return [] }
		do {
			let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
			guard let file = json as? [String: Any], let list = file["servers"] as? [[String: Any]] else {
				throw InstallError.unreadable(L("mcp.badFile"))
			}
			return list
		} catch let error as InstallError { throw error } catch { throw InstallError.unreadable(error.localizedDescription) }
	}

	static func installedNames(in workspace: String) -> Set<String> {
		Set(((try? servers(in: workspace)) ?? []).compactMap { $0["name"] as? String })
	}

	// Adds or replaces the entry with the same name. Returns the entry that was written.
	@discardableResult
	static func add(_ item: StoreItem, workspace: String) throws -> Entry {
		let new = try entry(for: item)
		var list = try servers(in: workspace).filter { ($0["name"] as? String) != new.name }
		guard list.count < maxServers else { throw InstallError.full }
		list.append(new.json)
		try write(list, workspace: workspace)
		return new
	}

	static func remove(_ name: String, workspace: String) throws {
		try write(try servers(in: workspace).filter { ($0["name"] as? String) != name }, workspace: workspace)
	}

	private static func write(_ list: [[String: Any]], workspace: String) throws {
		let url = configURL(workspace)
		try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
		let data = try JSONSerialization.data(withJSONObject: ["servers": list], options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
		try data.write(to: url, options: .atomic)
	}

	// The step only a person can do: confirm the new file content by typing `yes`.
	static func confirmJob() -> TerminalTab.Job? {
		guard let binary = RtClient.binaryPath() else { return nil }
		return TerminalTab.Job(executable: binary, args: ["trust", "allow", "mcp-servers"], title: L("mcp.confirmTab"))
	}
}
