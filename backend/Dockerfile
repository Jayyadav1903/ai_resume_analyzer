#Use an official, lightweight Python image
FROM python:3.10-slim

#Set  the working directory in the container
WORKDIR /app

#Copy the requirements file into the container
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

#Copy the rest of the backend code into the container
COPY . .

#Expose the port FastAPI runs on
EXPOSE 8000

RUN adduser --disabled-password --gecos '' celeryuser 

USER celeryuser

#The deafult command to run when the container starts
CMD uvicorn main:app --host 0.0.0.0 --port 8000
