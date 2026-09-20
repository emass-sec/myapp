from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://notes:change-me@localhost:5432/notes"
    cors_origins: str = "http://localhost:5173"
    # Cookie is always HttpOnly + SameSite=Lax; disable Secure only for plain-http local dev.
    cookie_secure: bool = True
    session_days: int = 7
    login_max_failures: int = 5
    login_window_minutes: int = 10
    signup_max_per_hour: int = 10

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
