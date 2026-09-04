import firebase_admin
from firebase_admin import credentials, firestore
import subprocess

cred = credentials.Certificate("service-account.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

device_id = "machine_001"

def on_snapshot(col_snapshot, changes, read_time):
    for change in changes:
        job = change.document.to_dict()

        if job.get("status") == "pending":
            text = job.get("text", "")

            subprocess.run(
                ["lp"],
                input=text,
                text=True,
                check=True
            )

            change.document.reference.update({
                "status": "printed"
            })

jobs = (
    db.collection("devices")
      .document(device_id)
      .collection("printJobs")
)

watch = jobs.where("status", "==", "pending").on_snapshot(on_snapshot)

print("Gist is listening for print jobs...")

while True:
    pass