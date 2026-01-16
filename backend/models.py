from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field, Relationship


class ProjectBase(SQLModel):
    name: str
    description: Optional[str] = None
    color: str = "#6366f1"
    position_x: float = 0.0
    position_z: float = 0.0


class Project(ProjectBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    tasks: list["Task"] = Relationship(back_populates="project")


class ProjectCreate(ProjectBase):
    pass


class ProjectRead(ProjectBase):
    id: int
    created_at: datetime


class TaskBase(SQLModel):
    title: str
    status: str = "todo"  # todo, in_progress, done
    priority: int = 0  # 0=low, 1=medium, 2=high
    deadline: Optional[datetime] = None


class Task(TaskBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    project: Optional[Project] = Relationship(back_populates="tasks")


class TaskCreate(TaskBase):
    pass


class TaskRead(TaskBase):
    id: int
    project_id: int
    created_at: datetime
