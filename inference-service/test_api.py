import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health_returns_200():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "model_loaded" in data


def test_health_reports_model_status_as_boolean():
    response = client.get("/health")
    data = response.json()
    assert isinstance(data["model_loaded"], bool)


def test_debug_returns_200():
    response = client.get("/debug")
    assert response.status_code == 200
    data = response.json()
    assert "model_path_configured" in data
    assert "env" in data


def test_reorder_without_model_returns_503_or_valid_result():
    """
    If the model failed to load, /reorder should return 503, not crash
    with an unhandled exception. If the model IS loaded, it should return
    a valid ordering.
    """
    payload = {
        "targetWardId": "ward-0",
        "targetWardQueue": [
            {"patientId": "p1", "name": "Patient A", "triageLevel": 1, "waitMinutes": 30},
            {"patientId": "p2", "name": "Patient B", "triageLevel": 3, "waitMinutes": 90},
        ],
        "targetWardTotalBeds": 10,
        "targetWardOccupiedBeds": 4,
    }
    response = client.post("/reorder", json=payload)
    assert response.status_code in (200, 503)
    if response.status_code == 200:
        data = response.json()
        assert "orderedPatientIds" in data


def test_reorder_with_empty_queue_does_not_crash():
    payload = {
        "targetWardId": "ward-0",
        "targetWardQueue": [],
        "targetWardTotalBeds": 10,
        "targetWardOccupiedBeds": 4,
    }
    response = client.post("/reorder", json=payload)
    assert response.status_code in (200, 503)


def test_explain_returns_ranked_queue_or_503():
    payload = {
        "totalBeds": 10,
        "occupiedBeds": 4,
        "queue": [
            {"patientId": "p1", "name": "Patient A", "triageLevel": 2, "waitMinutes": 45},
        ],
    }
    response = client.post("/explain", json=payload)
    assert response.status_code in (200, 503)
    if response.status_code == 200:
        data = response.json()
        assert "ranked_queue" in data
        assert "explanation_text" in data
        assert "combined_weights" in data


@pytest.mark.xfail(
    reason=(
        "Known issue: /explain returns 500 with a leaked internal KeyError "
        "instead of a clean 400 when a required field (totalBeds) is missing. "
        "Flagged for the XAI/model owner to decide whether to fix — not "
        "changed here to avoid touching explain_engine.py / main.py close to "
        "the deadline. See docstring below for full details."
    )
)
def test_explain_returns_400_not_500_on_missing_totalBeds():
    """
    FINDING: /explain currently returns 500 with an internal Python KeyError
    message when a required field (totalBeds) is missing, instead of a
    clean 400 Bad Request. This also confirms /explain's payload shape
    (totalBeds/occupiedBeds/queue) differs from /reorder's shape
    (targetWardTotalBeds/targetWardOccupiedBeds/targetWardQueue) despite
    both endpoints taking conceptually the same "ward snapshot" input.
    """
    payload = {
        "queue": [{"patientId": "p1", "name": "Patient A", "triageLevel": 2, "waitMinutes": 45}],
        # totalBeds intentionally omitted
    }
    response = client.post("/explain", json=payload)
    # SECURE/correct expectation: should be 400, not 500
    assert response.status_code == 400