import asyncio
import random
from datetime import datetime, timedelta

from sqlalchemy import select

from app.core.database import async_session_maker
from app.models import Application, Round, RoundType

# Round outcomes based on analytics.py
ROUND_OUTCOMES = ["Passed", "Failed", "Pending", "Withdrew"]

# Round types we'll use
DEFAULT_ROUND_TYPES = [
    "Phone Screen",
    "Technical",
    "Behavioral",
    "Take-home",
    "Onsite",
    "Final",
]


async def seed_rounds():
    async with async_session_maker() as session:
        # Get all round types
        result = await session.execute(select(RoundType))
        all_round_types = result.scalars().all()

        print(f"Found {len(all_round_types)} round types:")
        for rt in all_round_types:
            print(f"  - {rt.name} (id: {rt.id})")

        # Filter to default round types
        default_round_types = [
            rt for rt in all_round_types if rt.name in DEFAULT_ROUND_TYPES
        ]
        round_type_map = {rt.name: rt for rt in default_round_types}

        print(f"\nUsing {len(default_round_types)} default round types")

        # Get all applications
        result = await session.execute(select(Application))
        applications = result.scalars().all()

        print(f"\nFound {len(applications)} applications")

        if not applications:
            print("No applications found! Please run seed_data.py first.")
            return

        # Shuffle applications for random selection
        # Convert to list since random.shuffle requires MutableSequence
        applications_list = list(applications)
        random.shuffle(applications_list)

        # Track existing rounds to avoid duplicates
        result = await session.execute(select(Round))
        existing_rounds = result.scalars().all()
        existing_app_ids = {r.application_id for r in existing_rounds}

        print(f"Found {len(existing_rounds)} existing rounds")
        print(f"Applications with rounds: {len(existing_app_ids)}")

        # Generate rounds for applications that don't have any yet
        # or add more rounds to existing ones
        count = 0
        rounds_created = 0

        for app in applications_list[:80]:  # Limit to 80 applications for manageable data
            # Determine how many rounds this application should have
            # Weight toward fewer rounds (realistic distribution)
            rand = random.random()
            if rand < 0.20:
                num_rounds = 0  # No rounds
            elif rand < 0.45:
                num_rounds = 1  # Just phone screen
            elif rand < 0.70:
                num_rounds = 2  # Phone + Technical
            elif rand < 0.85:
                num_rounds = 3  # Phone + Technical + Behavioral
            elif rand < 0.95:
                num_rounds = 4  # Add Take-home or Onsite
            else:
                num_rounds = random.randint(5, 6)  # Full process

            if num_rounds == 0:
                continue

            # Create rounds for this application
            round_types_to_create = []

            # Define typical interview flow
            if num_rounds >= 1:
                round_types_to_create.append("Phone Screen")
            if num_rounds >= 2:
                round_types_to_create.append("Technical")
            if num_rounds >= 3:
                round_types_to_create.append("Behavioral")
            if num_rounds >= 4:
                # Choose between Take-home and Onsite
                round_types_to_create.append(random.choice(["Take-home", "Onsite"]))
            if num_rounds >= 5:
                # Add the other one
                if "Take-home" in round_types_to_create:
                    round_types_to_create.append("Onsite")
                else:
                    round_types_to_create.append("Take-home")
            if num_rounds >= 6:
                round_types_to_create.append("Final")

            # Get dates for this application (based on applied_at)
            applied_at = app.applied_at
            base_date = datetime.combine(applied_at, datetime.min.time())

            # Create each round
            for i, round_type_name in enumerate(round_types_to_create):
                round_type = round_type_map.get(round_type_name)
                if not round_type:
                    # Fall back to first available round type
                    round_type = default_round_types[0]

                # Calculate dates
                days_offset = (i + 1) * random.randint(3, 10)
                scheduled_at = base_date + timedelta(days=days_offset)

                # Determine outcome based on round progression
                # Earlier rounds have higher pass rates
                round_position = i + 1
                total_rounds = len(round_types_to_create)

                # Determine if this round should have an outcome
                # Last round or random chance
                if round_position == total_rounds or random.random() < 0.7:
                    # Determine outcome
                    if round_position == total_rounds:
                        # Final round outcomes
                        outcome_rand = random.random()
                        if outcome_rand < 0.30:
                            outcome = "Passed"
                        elif outcome_rand < 0.60:
                            outcome = "Failed"
                        elif outcome_rand < 0.80:
                            outcome = "Withdrew"
                        else:
                            outcome = "Pending"
                    else:
                        # Intermediate rounds - higher pass rate
                        outcome_rand = random.random()
                        if outcome_rand < 0.60:
                            outcome = "Passed"
                        elif outcome_rand < 0.85:
                            outcome = "Failed"
                        elif outcome_rand < 0.95:
                            outcome = "Withdrew"
                        else:
                            outcome = "Pending"

                    # Set completed_at based on scheduled_at + duration
                    duration_days = random.randint(1, 5)
                    completed_at = scheduled_at + timedelta(days=duration_days)

                    # If not Passed, stop creating further rounds
                    if outcome != "Passed":
                        # Still create this round, but break after
                        pass
                else:
                    outcome = None
                    completed_at = None

                # Create the round
                round = Round(
                    application_id=app.id,
                    round_type_id=round_type.id,
                    scheduled_at=scheduled_at,
                    completed_at=completed_at,
                    outcome=outcome,
                )
                session.add(round)
                rounds_created += 1

                # Stop creating rounds if this one didn't pass
                if outcome and outcome != "Passed":
                    break

            count += 1

        await session.commit()
        print(f"\n✅ Created {rounds_created} rounds for {count} applications!")

        # Verify the data
        print("\n=== Verification ===")
        result = await session.execute(select(Round))
        total_rounds = result.scalars().all()
        print(f"Total rounds in database: {len(total_rounds)}")

        # Breakdown by round type
        print("\nRound breakdown by type:")
        result = await session.execute(
            select(RoundType.name, Round.outcome, Round.completed_at)
            .select_from(Round)
            .join(RoundType, Round.round_type_id == RoundType.id)
            .order_by(RoundType.name)
        )
        rounds = result.all()

        round_counts = {}
        outcome_counts = {}

        for round_type_name, outcome, completed_at in rounds:
            if round_type_name not in round_counts:
                round_counts[round_type_name] = 0
            round_counts[round_type_name] += 1

            outcome_key = outcome if outcome else "Pending"
            if outcome_key not in outcome_counts:
                outcome_counts[outcome_key] = 0
            outcome_counts[outcome_key] += 1

        for rt_name, count in sorted(round_counts.items()):
            print(f"  {rt_name}: {count}")

        print("\nOutcome breakdown:")
        for outcome, count in sorted(outcome_counts.items()):
            print(f"  {outcome}: {count}")

        # Check completed vs pending
        result = await session.execute(
            select(Round).where(Round.completed_at.isnot(None))
        )
        completed = len(result.scalars().all())
        print(f"\nCompleted rounds: {completed}")
        print(f"Pending rounds: {len(total_rounds) - completed}")


if __name__ == "__main__":
    asyncio.run(seed_rounds())
