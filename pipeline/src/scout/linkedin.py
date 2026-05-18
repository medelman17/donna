import asyncio
import os
from typing import Any

from pydantic import BaseModel
from rich.console import Console

from scout.config import get_browserbase_keys, get_api_key

console = Console()


class Experience(BaseModel):
    title: str
    company: str
    duration: str | None = None
    description: str | None = None


class Education(BaseModel):
    school: str
    degree: str | None = None
    field: str | None = None
    years: str | None = None


class LinkedInProfileData(BaseModel):
    profile_url: str | None = None
    headline: str | None = None
    current_title: str | None = None
    current_company: str | None = None
    location: str | None = None
    experience: list[Experience] = []
    education: list[Education] = []
    skills: list[str] = []
    certifications: list[str] = []


async def scrape_linkedin(name: str | None, company: str | None, login: str) -> dict[str, Any] | None:
    bb_key, bb_project = get_browserbase_keys()
    model_key = get_api_key()

    search_terms = []
    if name:
        search_terms.append(f'"{name}"')
    if company:
        search_terms.append(f'"{company}"')
    if not search_terms:
        search_terms.append(login)
    search_query = " ".join(search_terms) + " site:linkedin.com/in"

    console.print(f"    [dim]LinkedIn: searching Google for:[/dim] {search_query}")

    try:
        from stagehand import AsyncStagehand

        console.print(f"    [dim]LinkedIn: connecting to Browserbase...[/dim]")
        async with AsyncStagehand(
            server="remote",
            browserbase_api_key=bb_key,
            browserbase_project_id=bb_project,
            model_api_key=model_key,
        ) as client:
            console.print(f"    [dim]LinkedIn: starting browser session...[/dim]")
            session = await client.sessions.start(
                model_name="anthropic/claude-sonnet-4-6",
                browser={"type": "browserbase"},
            )

            try:
                console.print(f"    [dim]LinkedIn: agent navigating Google → LinkedIn (max 8 steps)...[/dim]")
                await session.execute(
                    execute_options={
                        "instruction": (
                            f"Go to google.com and search for: {search_query}\n"
                            f"Click on the first LinkedIn profile result (linkedin.com/in/...).\n"
                            f"Wait for the profile page to fully load."
                        ),
                        "max_steps": 8,
                    },
                    agent_config={"model": "anthropic/claude-sonnet-4-6"},
                    timeout=60.0,
                )
                console.print(f"    [dim]LinkedIn: extracting profile data...[/dim]")

                result = await session.extract(
                    instruction=(
                        "Extract the LinkedIn profile data: headline, current job title and company, "
                        "location, work experience (title, company, duration for each role), "
                        "education (school, degree, field), and listed skills. "
                        "Also extract the profile URL from the browser address bar."
                    ),
                    schema=LinkedInProfileData,
                )

                profile = result.data.result
                if profile and isinstance(profile, LinkedInProfileData):
                    exp_count = len(profile.experience)
                    skill_count = len(profile.skills)
                    console.print(
                        f"    [green]LinkedIn: extracted[/green] — "
                        f"{profile.headline or 'no headline'}, "
                        f"{exp_count} roles, {skill_count} skills"
                    )
                    return {
                        "profile_url": profile.profile_url,
                        "headline": profile.headline,
                        "current_title": profile.current_title,
                        "current_company": profile.current_company,
                        "location": profile.location,
                        "experience": [e.model_dump() for e in profile.experience],
                        "education": [e.model_dump() for e in profile.education],
                        "skills": profile.skills,
                        "certifications": profile.certifications,
                    }
                else:
                    console.print(f"    [yellow]LinkedIn: extraction returned empty result[/yellow]")
            finally:
                console.print(f"    [dim]LinkedIn: ending session[/dim]")
                await session.end()

    except Exception as e:
        console.print(f"    [red]LinkedIn: failed — {type(e).__name__}: {e}[/red]")

    return None
