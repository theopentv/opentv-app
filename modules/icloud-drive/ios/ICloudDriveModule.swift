import ExpoModulesCore

internal final class ICloudUnavailableException: Exception {
  override var reason: String {
    "iCloud Drive is unavailable — sign in to iCloud and turn on iCloud Drive"
  }
}

internal final class BadBase64Exception: Exception {
  override var reason: String { "Payload is not valid base64" }
}

internal final class FileMissingException: Exception {
  override var reason: String { "File does not exist in the iCloud container" }
}

internal final class DownloadTimeoutException: Exception {
  override var reason: String { "Timed out downloading the file from iCloud" }
}

public class ICloudDriveModule: Module {
  // url(forUbiquityContainerIdentifier:) provisions the container on first
  // call and can take seconds — cache the base URL so only one call pays
  private var containerBase: URL?

  private func containerRoot() throws -> URL {
    if let cached = containerBase { return cached }
    guard let fresh = FileManager.default.url(forUbiquityContainerIdentifier: nil) else {
      throw ICloudUnavailableException()
    }
    containerBase = fresh
    return fresh
  }

  // Documents/ inside the app's iCloud container — files here survive app
  // deletion and (with NSUbiquitousContainerIsDocumentScopePublic) appear
  // in the Files app under iCloud Drive
  private func containerDocuments() throws -> URL {
    let docs = try containerRoot().appendingPathComponent("Documents", isDirectory: true)
    try FileManager.default.createDirectory(at: docs, withIntermediateDirectories: true)
    return docs
  }

  // OpenTVSync/ at the container ROOT, beside Documents rather than in it:
  // only Documents is shown in the Files app, so the sync files (2.0.0) are
  // invisible there and cannot be tidied away by somebody who does not know
  // what they are. Still in the user's own iCloud, still deleted with it.
  private static let syncDir = "OpenTVSync"
  private func syncRoot() throws -> URL {
    let dir = try containerRoot().appendingPathComponent(ICloudDriveModule.syncDir, isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  // A sync file name is one path component of our own making; refuse
  // anything that could step outside the folder.
  private func syncURL(_ name: String) throws -> URL {
    guard !name.isEmpty, !name.contains("/"), !name.hasPrefix(".") else { throw FileMissingException() }
    return try syncRoot().appendingPathComponent(name)
  }

  public func definition() -> ModuleDefinition {
    Name("ICloudDrive")

    // signed into iCloud with iCloud Drive on? cheap enough to call anywhere
    Function("isAvailable") { () -> Bool in
      FileManager.default.ubiquityIdentityToken != nil
    }

    // same check off the JS thread — ubiquityIdentityToken can stall on a
    // cold/odd iCloud state, and a synchronous call would freeze the app
    AsyncFunction("isAvailableAsync") { () -> Bool in
      FileManager.default.ubiquityIdentityToken != nil
    }

    AsyncFunction("writeFile") { (name: String, base64: String) in
      guard let data = Data(base64Encoded: base64) else { throw BadBase64Exception() }
      let url = try self.containerDocuments().appendingPathComponent(name)
      try data.write(to: url, options: .atomic)
    }

    // exists covers both a downloaded file and an undownloaded cloud
    // placeholder (.name.icloud) — right after a reinstall only the
    // placeholder is on disk
    AsyncFunction("fileInfo") { (name: String) -> [String: Any?] in
      let docs = try self.containerDocuments()
      let real = docs.appendingPathComponent(name)
      let placeholder = docs.appendingPathComponent(".\(name).icloud")
      let fm = FileManager.default
      let downloaded = fm.fileExists(atPath: real.path)
      let exists = downloaded || fm.fileExists(atPath: placeholder.path)
      guard exists else {
        return ["exists": false, "downloaded": false, "modifiedAt": nil, "size": nil]
      }
      let attrs = try? fm.attributesOfItem(atPath: downloaded ? real.path : placeholder.path)
      let date = attrs?[.modificationDate] as? Date
      let size = attrs?[.size] as? NSNumber
      return [
        "exists": true,
        "downloaded": downloaded,
        "modifiedAt": date.map { $0.timeIntervalSince1970 * 1000 },
        "size": size?.intValue,
      ]
    }

    // downloads from iCloud first if only the placeholder is local
    AsyncFunction("readFile") { (name: String, timeoutMs: Int) -> String in
      let docs = try self.containerDocuments()
      let url = docs.appendingPathComponent(name)
      let placeholder = docs.appendingPathComponent(".\(name).icloud")
      let fm = FileManager.default
      if !fm.fileExists(atPath: url.path) {
        guard fm.fileExists(atPath: placeholder.path) else { throw FileMissingException() }
        try fm.startDownloadingUbiquitousItem(at: url)
        let deadline = Date().addingTimeInterval(Double(timeoutMs) / 1000)
        while !fm.fileExists(atPath: url.path) {
          if Date() > deadline { throw DownloadTimeoutException() }
          Thread.sleep(forTimeInterval: 0.3)
        }
      }
      return try Data(contentsOf: url).base64EncodedString()
    }

    // ── sync files (2.0.0) ───────────────────────────────────────────────

    // WHAT iCLOUD KNOWS ABOUT, not just what is on disk. A file another
    // device wrote shows up here as metadata long before its bytes arrive,
    // and only an NSMetadataQuery sees it then — a directory listing would
    // not, so the other device's changes would wait on the OS for no reason.
    // Undelivered files are asked for as they are seen, so the next poll
    // usually finds them ready. The local directory is folded in too: a file
    // this device just wrote may not be indexed yet.
    AsyncFunction("listFiles") { (promise: Promise) in
      let root: URL
      do { root = try self.syncRoot() } catch { promise.reject(error); return }
      DispatchQueue.main.async {
        let query = NSMetadataQuery()
        query.searchScopes = [NSMetadataQueryUbiquitousDataScope]
        query.predicate = NSPredicate(format: "%K LIKE %@", NSMetadataItemFSNameKey, "*.json")
        var finished = false
        var observer: NSObjectProtocol?
        let finish = {
          if finished { return }
          finished = true
          query.disableUpdates()
          var out: [String: [String: Any]] = [:]
          let fm = FileManager.default
          for case let item as NSMetadataItem in query.results {
            guard let url = item.value(forAttribute: NSMetadataItemURLKey) as? URL,
                  url.deletingLastPathComponent().lastPathComponent == ICloudDriveModule.syncDir else { continue }
            let status = item.value(forAttribute: NSMetadataUbiquitousItemDownloadingStatusKey) as? String
            let ready = status == nil || status != NSMetadataUbiquitousItemDownloadingStatusNotDownloaded
            if !ready { try? fm.startDownloadingUbiquitousItem(at: url) }
            let date = item.value(forAttribute: NSMetadataItemFSContentChangeDateKey) as? Date
            out[url.lastPathComponent] = [
              "name": url.lastPathComponent,
              "ready": ready,
              "modifiedAt": (date ?? Date()).timeIntervalSince1970 * 1000,
            ]
          }
          query.stop()
          if let o = observer { NotificationCenter.default.removeObserver(o) }
          let local = (try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
          for url in local {
            var name = url.lastPathComponent
            var ready = true
            // An undelivered file on older iOS: ".name.icloud".
            if name.hasPrefix("."), name.hasSuffix(".icloud") {
              name = String(name.dropFirst().dropLast(".icloud".count))
              ready = false
              try? fm.startDownloadingUbiquitousItem(at: root.appendingPathComponent(name))
            }
            guard name.hasSuffix(".json"), out[name] == nil else { continue }
            let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
            out[name] = ["name": name, "ready": ready, "modifiedAt": (date ?? Date()).timeIntervalSince1970 * 1000]
          }
          promise.resolve(Array(out.values))
        }
        observer = NotificationCenter.default.addObserver(
          forName: .NSMetadataQueryDidFinishGathering, object: query, queue: .main
        ) { _ in finish() }
        if !query.start() { finish(); return }
        // A query that never finishes gathering (iCloud signed out mid-way)
        // must not hang the sync: answer with what is on disk.
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { finish() }
      }
    }

    AsyncFunction("writeText") { (name: String, text: String) in
      let url = try self.syncURL(name)
      try text.write(to: url, atomically: true, encoding: .utf8)
    }

    // Asks iCloud for the bytes and waits up to timeoutMs for them — the same
    // bargain as readFile, by download status rather than by file existence,
    // because a newer iOS keeps an undelivered file at its real path.
    AsyncFunction("readText") { (name: String, timeoutMs: Int) -> String in
      let url = try self.syncURL(name)
      let fm = FileManager.default
      try? fm.startDownloadingUbiquitousItem(at: url)
      let deadline = Date().addingTimeInterval(Double(timeoutMs) / 1000)
      while true {
        if fm.fileExists(atPath: url.path) {
          let v = try? url.resourceValues(forKeys: [.isUbiquitousItemKey, .ubiquitousItemDownloadingStatusKey])
          let status = v?.ubiquitousItemDownloadingStatus
          if v?.isUbiquitousItem != true || status == .current || status == .downloaded { break }
        }
        if Date() > deadline { throw DownloadTimeoutException() }
        Thread.sleep(forTimeInterval: 0.3)
      }
      return try String(contentsOf: url, encoding: .utf8)
    }

    // Gone already is done: two runs may both decide to tidy the same chunk.
    AsyncFunction("deleteFile") { (name: String) in
      let url = try self.syncURL(name)
      if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
    }
  }
}
