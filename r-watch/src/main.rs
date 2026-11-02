
use stopwatch::run_stopwatch;
use std::io;

mod stopwatch;

fn main() -> io::Result<()> {
    let r = run_stopwatch()?; // terminal is restored once this returns
    println!("date:    {}", r.date);
    println!("start:   {}", r.start_time.to_rfc3339());
    println!("end:     {}", r.end_time.to_rfc3339());
    println!("value:   {}", r.value);
    println!("ms:      {}", r.elapsed_ms);
    // Log to your DB here, e.g. with sqlx / rusqlite:
    // INSERT INTO sessions (date, start_time, end_time, elapsed_ms, value) VALUES (?, ?, ?, ?, ?)
    Ok(())
}