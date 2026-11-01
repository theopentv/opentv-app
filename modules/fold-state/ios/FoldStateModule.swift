import ExpoModulesCore
import UIKit

/// The iPhone Duo hinge as "closed", "partial", "open" or "unknown".
/// Half open (book) splits at the fold; flat gives the right half more room.
public class FoldStateModule: Module {
  private var interaction: UIInteraction?
  private weak var host: UIView?
  private var status = "unknown"

  public func definition() -> ModuleDefinition {
    Name("FoldState")
    Events("onChange")

    Function("getStatus") { self.status }

    OnStartObserving {
      DispatchQueue.main.async { self.attach() }
    }
    OnStopObserving {
      DispatchQueue.main.async {
        if let i = self.interaction { self.host?.removeInteraction(i) }
        self.interaction = nil
      }
    }
  }

  private func attach() {
    guard interaction == nil else { return }
    guard #available(iOS 27.1, *) else { return }
    let window = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
    guard let window else { return }
    let i = UIHingeInteraction { [weak self] _, update in
      guard let self else { return }
      let s: String
      switch update.hinge?.status {
      case .closed?: s = "closed"
      case .partiallyOpen?: s = "partial"
      case .fullyOpen?: s = "open"
      default: s = "unknown"
      }
      guard s != self.status else { return }
      self.status = s
      self.sendEvent("onChange", ["status": s])
    }
    window.addInteraction(i)
    interaction = i
    host = window
  }
}
