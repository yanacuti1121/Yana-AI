import SwiftUI

/// The Yana rabbit as a 20x15 pixel sprite (tall two-tone ears, light face, dark eyes,
/// pink nose) sitting behind a laptop whose lid faces the viewer. The dot on the lid
/// takes the colour of the current state.
struct RabbitView: View {
    let state: PillState
    let tick: Int

    private static let base: [[Character]] = [
        ".....BB......CC.....",
        ".....BB......CC.....",
        ".....BI......IC.....",
        ".....BI......IC.....",
        "....WWWWWWWWWWWW....",
        "...WWWWWWWWWWWWWW...",
        "...WWEEWWWWWWEEWW...",
        "...WWWWWWWWWWWWWW...",
        "....WWWWWRRWWWWW....",
        ".....WWWWWWWWWW.....",
        "....LLLLLLLLLLLL....",
        "....LLLLLLLLLLLL....",
        "....LLLLLLLLLLLL....",
        "...DDDDDDDDDDDDDD...",
        "....................",
    ].map { Array($0) }

    private static let palette: [Character: Color] = [
        "B": Color(red: 0.43, green: 0.49, blue: 1.0),
        "C": Color(red: 0.21, green: 0.82, blue: 1.0),
        "I": Color(red: 0.86, green: 0.89, blue: 1.0),
        "W": Color(red: 0.93, green: 0.95, blue: 1.0),
        "E": Color(red: 0.11, green: 0.14, blue: 0.25),
        "R": Color(red: 1.0, green: 0.56, blue: 0.69),
        "P": Color(red: 0.93, green: 0.95, blue: 1.0),
        "L": Color(red: 0.60, green: 0.64, blue: 0.70),
        "D": Color(red: 0.29, green: 0.33, blue: 0.44),
        "X": Color(red: 0.94, green: 0.27, blue: 0.27),
        "G": Color(red: 0.13, green: 0.77, blue: 0.37),
        "Z": Color(red: 0.56, green: 0.56, blue: 0.58),
    ]

    private static let eyeColumns = [5, 6, 13, 14]
    private static let pixel: CGFloat = 1.5

    var body: some View {
        Canvas { context, _ in
            let grid = frame()
            for (y, row) in grid.enumerated() {
                for (x, ch) in row.enumerated() where ch != "." {
                    let color = ch == "O" ? state.tint : (Self.palette[ch] ?? .clear)
                    let rect = CGRect(x: CGFloat(x) * Self.pixel, y: CGFloat(y) * Self.pixel,
                                      width: Self.pixel, height: Self.pixel)
                    context.fill(Path(rect), with: .color(color))
                }
            }
        }
        .frame(width: 20 * Self.pixel, height: 15 * Self.pixel)
        .shadow(color: state.tint.opacity(0.55), radius: 3)
    }

    private func frame() -> [[Character]] {
        var g = Self.base
        func put(_ r: Int, _ c: Int, _ ch: Character) { g[r][c] = ch }
        func paws(_ left: Int, _ right: Int) {
            [2, 3].forEach { put(left, $0, "P") }
            [16, 17].forEach { put(right, $0, "P") }
        }
        switch state {
        case .run:
            if tick % 2 == 1 { paws(11, 10) } else { paws(10, 11) }
        case .ask:
            for r in [9, 8, 7] { put(r, 2, "P"); put(r, 3, "P") }
            if tick % 2 == 1 { put(0, 5, "."); put(1, 5, ".") }
        case .deny:
            Self.eyeColumns.forEach { put(6, $0, "X") }; paws(10, 10)
        case .done:
            Self.eyeColumns.forEach { put(6, $0, "G") }; paws(10, 10)
        case .idle:
            Self.eyeColumns.forEach { put(6, $0, "Z") }; paws(11, 11)
        }
        put(11, 9, "O"); put(11, 10, "O")
        return g
    }
}

/// 3x3 dot matrix on the right of the pill: a spinner while running, steady patterns otherwise.
struct DotMatrix: View {
    let state: PillState
    let tick: Int

    private static let spin: [[Int]] = [[0, 1, 3], [1, 2, 5], [2, 5, 8], [5, 8, 7], [8, 7, 6], [7, 6, 3], [6, 3, 0]]

    private var lit: Set<Int> {
        switch state {
        case .run: return Set(Self.spin[tick % Self.spin.count])
        case .ask: return [4, tick % 2 == 1 ? 1 : 7]
        case .deny: return [0, 2, 4, 6, 8]
        case .done: return [6, 7, 5, 2]
        case .idle: return tick % 6 < 3 ? [4] : []
        }
    }

    var body: some View {
        let on = lit
        VStack(spacing: 3) {
            ForEach(0..<3, id: \.self) { row in
                HStack(spacing: 3) {
                    ForEach(0..<3, id: \.self) { col in
                        RoundedRectangle(cornerRadius: 2)
                            .fill(state.tint)
                            .frame(width: 7, height: 7)
                            .opacity(on.contains(row * 3 + col) ? 1 : 0.16)
                    }
                }
            }
        }
        .shadow(color: state.tint.opacity(0.7), radius: 4)
    }
}
