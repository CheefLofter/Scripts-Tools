// Cargo.toml:
//   [dependencies]
//   chrono = "0.4"
//   crossterm = "0.28"

use chrono::{DateTime, Local, NaiveDate};
use crossterm::{
    cursor,
    event::{self, Event, KeyCode, KeyEventKind, KeyModifiers},
    execute, terminal,
};
use std::io::{self, Write};
use std::time::{Duration, Instant};

/// Everything you need to log a run into a database.
#[derive(Debug, Clone)]
pub struct StopwatchResult {
    /// Local calendar date the stopwatch was started on.
    pub date: NaiveDate,
    /// Wall-clock start time.
    pub start_time: DateTime<Local>,
    /// Wall-clock end time.
    pub end_time: DateTime<Local>,
    /// Active time only (paused time is excluded).
    pub elapsed: Duration,
    /// Elapsed time in milliseconds (handy as an integer DB column).
    pub elapsed_ms: u64,
    /// Display value, e.g. "0:03.3".
    pub value: String,
}

// Colors sampled from the reference picture.
const FG: &str = "\x1b[38;2;0;190;190m";
const BG: &str = "\x1b[48;2;17;43;50m";
const DIM: &str = "\x1b[38;2;70;120;125m";

/// "M:SS.t" (or "H:MM:SS.t" past an hour), like "0:03.3".
fn format_elapsed(d: Duration) -> String {
    let tenths = (d.as_millis() / 100) % 10;
    let total_s = d.as_secs();
    let h = total_s / 3600;
    let m = (total_s / 60) % 60;
    let s = total_s % 60;
    if h > 0 {
        format!("{}:{:02}:{:02}.{}", h, m, s, tenths)
    } else {
        format!("{}:{:02}.{}", m, s, tenths)
    }
}

/// 3x5 pixel glyphs ('1' = filled). ':' and '.' are 1 pixel wide.
fn glyph(c: char) -> &'static [&'static str; 5] {
    match c {
        '0' => &["111", "101", "101", "101", "111"],
        '1' => &["010", "110", "010", "010", "111"],
        '2' => &["111", "001", "111", "100", "111"],
        '3' => &["111", "001", "111", "001", "111"],
        '4' => &["101", "101", "111", "001", "001"],
        '5' => &["111", "100", "111", "001", "111"],
        '6' => &["111", "100", "111", "101", "111"],
        '7' => &["111", "001", "001", "001", "001"],
        '8' => &["111", "101", "111", "101", "111"],
        '9' => &["111", "101", "111", "001", "111"],
        ':' => &["0", "1", "0", "1", "0"],
        _ => &["0", "0", "0", "0", "1"], // '.'
    }
}

/// Builds the 5 text rows of big blocky digits (each pixel = 2 columns wide).
fn big_rows(text: &str) -> Vec<String> {
    (0..5)
        .map(|row| {
            let mut line = String::new();
            for (i, c) in text.chars().enumerate() {
                if i > 0 {
                    // one pixel gap, plus an extra one before the decimal dot
                    line.push_str(if c == '.' { "    " } else { "  " });
                }
                for px in glyph(c)[row].chars() {
                    line.push_str(if px == '1' { "██" } else { "  " });
                }
            }
            line
        })
        .collect()
}

/// Restores the terminal even if we return early with an error.
struct TermGuard;
impl TermGuard {
    fn new() -> io::Result<Self> {
        terminal::enable_raw_mode()?;
        execute!(io::stdout(), terminal::EnterAlternateScreen, cursor::Hide)?;
        Ok(TermGuard)
    }
}
impl Drop for TermGuard {
    fn drop(&mut self) {
        let _ = execute!(io::stdout(), cursor::Show, terminal::LeaveAlternateScreen);
        let _ = write!(io::stdout(), "\x1b[0m");
        let _ = terminal::disable_raw_mode();
    }
}

fn draw(out: &mut impl Write, text: &str, paused: bool) -> io::Result<()> {
    let (cols, rows) = terminal::size()?;
    let (cols, rows) = (cols as usize, rows as usize);
    let lines = big_rows(text);
    let width = lines[0].chars().count();
    let x = cols.saturating_sub(width) / 2;
    let y = rows.saturating_sub(5) / 2;

    write!(out, "{BG}\x1b[2J")?; // fill the whole screen with the background
    for (i, line) in lines.iter().enumerate() {
        write!(out, "\x1b[{};{}H{FG}{}", y + i + 1, x + 1, line)?;
    }
    let hint = if paused {
        "PAUSED - space: resume, enter: stop"
    } else {
        "space: pause, enter: stop"
    };
    let hx = cols.saturating_sub(hint.len()) / 2;
    write!(out, "\x1b[{};{}H{DIM}{}", y + 8, hx + 1, hint)?;
    out.flush()
}

/// Runs a live full-screen terminal stopwatch.
/// Controls: SPACE = pause/resume, ENTER / q / Esc / Ctrl+C = stop.
pub fn run_stopwatch() -> io::Result<StopwatchResult> {
    let start_time = Local::now();
    let mut accumulated = Duration::ZERO;
    let mut running_since: Option<Instant> = Some(Instant::now());

    let _guard = TermGuard::new()?;
    let mut out = io::stdout();

    let current = |acc: Duration, since: Option<Instant>| {
        acc + since.map_or(Duration::ZERO, |t| t.elapsed())
    };

    let mut last = (String::new(), true, (0u16, 0u16));
    loop {
        let elapsed = current(accumulated, running_since);
        let text = format_elapsed(elapsed);
        let paused = running_since.is_none();
        let size = terminal::size()?;
        if (text.clone(), paused, size) != last {
            draw(&mut out, &text, paused)?;
            last = (text, paused, size);
        }

        if event::poll(Duration::from_millis(30))? {
            if let Event::Key(key) = event::read()? {
                if key.kind != KeyEventKind::Press {
                    continue;
                }
                match key.code {
                    KeyCode::Char(' ') => match running_since.take() {
                        Some(t) => accumulated += t.elapsed(), // pause
                        None => running_since = Some(Instant::now()), // resume
                    },
                    KeyCode::Enter | KeyCode::Esc | KeyCode::Char('q') => break,
                    KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => break,
                    _ => {}
                }
            }
        }
    }

    let end_time = Local::now();
    let elapsed = current(accumulated, running_since);

    Ok(StopwatchResult {
        date: start_time.date_naive(),
        start_time,
        end_time,
        elapsed,
        elapsed_ms: elapsed.as_millis() as u64,
        value: format_elapsed(elapsed),
    })
}
