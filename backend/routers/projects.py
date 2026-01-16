from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Project, ProjectCreate, ProjectRead
from database import get_session

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectRead])
async def list_projects(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Project))
    return result.scalars().all()


@router.post("", response_model=ProjectRead)
async def create_project(project: ProjectCreate, session: AsyncSession = Depends(get_session)):
    db_project = Project.model_validate(project)
    session.add(db_project)
    await session.commit()
    await session.refresh(db_project)
    return db_project


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(project_id: int, session: AsyncSession = Depends(get_session)):
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}", response_model=ProjectRead)
async def update_project(project_id: int, project: ProjectCreate, session: AsyncSession = Depends(get_session)):
    db_project = await session.get(Project, project_id)
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    for key, value in project.model_dump().items():
        setattr(db_project, key, value)
    await session.commit()
    await session.refresh(db_project)
    return db_project


@router.delete("/{project_id}")
async def delete_project(project_id: int, session: AsyncSession = Depends(get_session)):
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await session.delete(project)
    await session.commit()
    return {"ok": True}
