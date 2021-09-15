# Generated by Django 3.2.5 on 2021-09-10 11:39

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import posthog.models.utils


class Migration(migrations.Migration):

    dependencies = [
        ("posthog", "0168_per_project_access"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("ee", "0004_enterpriseeventdefinition_enterprisepropertydefinition"),
    ]

    operations = [
        migrations.CreateModel(
            name="ExplicitTeamMembership",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=posthog.models.utils.UUIDT, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("level", models.PositiveSmallIntegerField(choices=[(1, "member"), (8, "administrator")], default=1)),
                ("joined_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "team",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="explicit_memberships",
                        related_query_name="explicit_membership",
                        to="posthog.team",
                    ),
                ),
                (
                    "parent_membership",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="explicit_team_memberships",
                        related_query_name="explicit_team_membership",
                        to="posthog.organizationmembership",
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="explicitteammembership",
            constraint=models.UniqueConstraint(
                fields=("team", "parent_membership"), name="unique_explicit_team_membership"
            ),
        ),
    ]
