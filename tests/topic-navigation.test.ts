import { test } from "node:test";
import assert from "node:assert/strict";
import { groupPracticeTopics, topicGroups, topicTitle } from "../src/lib/practice/topic-navigation";

test("mobile groups include every catalogue topic once and preserve official labels", () => {
  const topics = [...topicGroups.flatMap(group => [...group.codes]), "future-code"].map(code => ({ id: code, code, name: `Official ${code}`, questionCount: 50, imageCount: 1 }));
  const before = structuredClone(topics);
  const groups = groupPracticeTopics(topics);
  assert.equal(new Set(groups.flatMap(group => group.topics.map(topic => topic.id))).size, 26);
  assert.equal(groups.flatMap(group => group.topics).length, 26);
  assert.equal(groups.at(-1)?.id, "other");
  assert.deepEqual(topics, before);
  assert.equal(topicTitle(topics[0]), "Segnali di pericolo");
  assert.equal(topicTitle(topics.at(-1)!), "Official future-code");
});

test("empty macro groups are omitted when the usable catalogue is partial", () => {
  assert.deepEqual(groupPracticeTopics([]), []);
  const groups = groupPracticeTopics([{ id: "one", code: "4056", name: "Official", questionCount: 20, imageCount: 0 }]);
  assert.deepEqual(groups.map(group => group.id), ["signals"]);
});
