from backend.app.schema import DISEASES, LABEL_NAMES, LABEL_TOPIC, TOPIC_DISEASE, Task, Topic


def test_every_label_maps_to_topic_and_name():
    assert set(LABEL_TOPIC) == set(LABEL_NAMES)
    assert {label for task, label in LABEL_TOPIC if task is Task.STATUS3} == {0, 1, 2}
    assert {label for task, label in LABEL_TOPIC if task is Task.DIABTYPE} == {1, 2}


def test_every_topic_maps_to_known_disease():
    assert set(TOPIC_DISEASE) == set(Topic)
    assert set(TOPIC_DISEASE.values()) <= set(DISEASES)
