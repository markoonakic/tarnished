import asyncio
import random
from datetime import date, timedelta

from sqlalchemy import select

from app.core.database import async_session_maker
from app.models import Application, ApplicationStatus, User


async def seed_data():
    async with async_session_maker() as session:
        # Get all statuses
        result = await session.execute(select(ApplicationStatus))
        statuses = result.scalars().all()

        print(f"Found {len(statuses)} statuses:")
        for s in statuses:
            print(f"  - {s.name} (color: {s.color})")

        # Get user by email
        result = await session.execute(
            select(User).where(User.email == "kurton@kurton.com")
        )
        user = result.scalars().first()

        if not user:
            print("User kurton@kurton.com not found!")
            return

        print(f"\nCreating 120 applications for: {user.email}")

        companies = [
            "Google",
            "Meta",
            "Amazon",
            "Apple",
            "Microsoft",
            "Netflix",
            "Stripe",
            "Uber",
            "Airbnb",
            "Coinbase",
            "OpenAI",
            "Anthropic",
            "Databricks",
            "Snowflake",
            "Palantir",
            "Robinhood",
            "Square",
            "Shopify",
            "Slack",
            "Notion",
            "Figma",
            "Canva",
            "Adobe",
            "Salesforce",
            "Oracle",
            "IBM",
            "Tesla",
            "SpaceX",
            "NVIDIA",
            "AMD",
            "Intel",
            "Cisco",
            "VMware",
        ]

        titles = [
            "Senior Software Engineer",
            "Backend Engineer",
            "Full Stack Developer",
            "Frontend Engineer",
            "DevOps Engineer",
            "Site Reliability Engineer",
            "Software Engineer II",
            "Staff Software Engineer",
            "Principal Engineer",
            "Product Manager",
            "Technical Program Manager",
            "Engineering Manager",
            "Data Scientist",
            "ML Engineer",
            "iOS Developer",
            "Android Developer",
        ]

        count = 0
        for i in range(120):
            # Weighted status distribution (more Applied, fewer Offers)
            rand = random.random()
            if rand < 0.40:
                # Use first status (usually Applied/Applied)
                status = statuses[0]
            elif rand < 0.65:
                # Find interview/screen statuses
                interview_statuses = [
                    s for s in statuses if "Interview" in s.name or "Screen" in s.name
                ]
                status = (
                    random.choice(interview_statuses)
                    if interview_statuses
                    else statuses[0]
                )
            elif rand < 0.85:
                # Find rejected/declined statuses
                rejected_statuses = [
                    s for s in statuses if "Rejected" in s.name or "Declined" in s.name
                ]
                status = (
                    random.choice(rejected_statuses)
                    if rejected_statuses
                    else statuses[0]
                )
            else:
                # Find offer/accepted statuses
                offer_statuses = [
                    s for s in statuses if "Offer" in s.name or "Accepted" in s.name
                ]
                status = (
                    random.choice(offer_statuses) if offer_statuses else statuses[0]
                )

            # Random date within last 90 days
            days_ago = random.randint(0, 90)
            applied_date = date.today() - timedelta(days=days_ago)

            app = Application(
                user_id=user.id,
                company=random.choice(companies),
                job_title=random.choice(titles),
                status_id=status.id,
                applied_at=applied_date,
                job_url=f"https://careers.example.com/job/{i}",
            )
            session.add(app)
            count += 1

        await session.commit()
        print(f"\n✅ Created {count} test applications!")
        print("\nStatus breakdown:")
        for status in statuses:
            result = await session.execute(
                select(Application)
                .where(
                    Application.status_id == status.id, Application.user_id == user.id
                )
                .where(Application.company != "DO NOT DELETE")
            )
            count = len(result.scalars().all())
            if count > 0:
                print(f"  {status.name}: {count}")


if __name__ == "__main__":
    asyncio.run(seed_data())
