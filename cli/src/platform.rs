#[derive(clap::ValueEnum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Platform {
    Ios,
    Macos,
}
