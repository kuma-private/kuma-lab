import SwiftUI
import AppKit

/// Distribution setup wizard — Phase 1 scaffold.
/// Diagnoses the local environment and shows copy-pasteable fix commands.
struct SetupView: View {
    @StateObject private var checker = SetupChecker()
    @AppStorage("projectPath") private var projectPath = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("セットアップ診断").font(.title2).bold()
                Spacer()
                Button(checker.isChecking ? "診断中..." : "再チェック") {
                    checker.check(projectPath: projectPath)
                }
                .disabled(checker.isChecking || projectPath.isEmpty)
            }

            Text("Seaman を動かすために必要な環境を順にチェックします。不足があれば下のコマンドを Terminal で実行してください。")
                .font(.caption)
                .foregroundColor(.secondary)

            Divider()

            if checker.items.isEmpty {
                VStack(spacing: 8) {
                    Text("まだチェックしていません").foregroundColor(.secondary)
                    Button("今すぐチェック") {
                        checker.check(projectPath: projectPath)
                    }
                    .disabled(projectPath.isEmpty)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(checker.items) { item in
                            itemRow(item)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .padding()
        .frame(width: 640, height: 560)
        .onAppear {
            if checker.items.isEmpty && !projectPath.isEmpty {
                checker.check(projectPath: projectPath)
            }
        }
    }

    @ViewBuilder
    private func itemRow(_ item: SetupItem) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                statusIcon(item.status)
                Text(item.title).bold()
                Spacer()
                statusLabel(item.status)
            }
            Text(item.detail)
                .font(.caption)
                .foregroundColor(.secondary)
                .textSelection(.enabled)

            if case .missing = item.status, let hint = item.fixHint {
                HStack(alignment: .top) {
                    Text(hint)
                        .font(.system(size: 11, design: .monospaced))
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.gray.opacity(0.12))
                        .cornerRadius(6)
                        .textSelection(.enabled)
                    Button("コピー") {
                        let pb = NSPasteboard.general
                        pb.clearContents()
                        pb.setString(hint, forType: .string)
                    }
                    .controlSize(.small)
                }
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(Color.gray.opacity(0.06))
        .cornerRadius(8)
    }

    @ViewBuilder
    private func statusIcon(_ s: SetupItem.Status) -> some View {
        switch s {
        case .ok:
            Image(systemName: "checkmark.circle.fill").foregroundColor(.green)
        case .missing:
            Image(systemName: "xmark.octagon.fill").foregroundColor(.red)
        case .unknown:
            Image(systemName: "questionmark.circle").foregroundColor(.secondary)
        }
    }

    @ViewBuilder
    private func statusLabel(_ s: SetupItem.Status) -> some View {
        switch s {
        case .ok:
            Text("OK").font(.caption).foregroundColor(.green)
        case .missing(let why):
            Text(why).font(.caption).foregroundColor(.red)
        case .unknown:
            Text("未チェック").font(.caption).foregroundColor(.secondary)
        }
    }
}
