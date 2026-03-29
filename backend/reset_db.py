from database import engine, Base

print("🚨 Dropping all old tables...")
Base.metadata.drop_all(bind=engine)

print("🏗️ Rebuilding tables with the new schema...")
Base.metadata.create_all(bind=engine)

print("✅ Database successfully reset!")