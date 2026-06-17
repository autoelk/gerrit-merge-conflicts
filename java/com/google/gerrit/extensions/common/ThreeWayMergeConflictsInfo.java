// Copyright (C) 2026 The Android Open Source Project
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package com.google.gerrit.extensions.common;

import java.util.List;

/** Information for rendering and resolving conflicts in a three-way merge UI. */
public class ThreeWayMergeConflictsInfo {
  /** The revision SHA used as base in three-way conflict comparison. */
  public String base;

  /** The revision SHA for the currently checked patch set ("ours"). */
  public String current;

  /** The revision SHA for the incoming revision to merge ("theirs"). */
  public String incoming;

  /** File-level conflict payloads for rendering the merge UI. */
  public List<ConflictFileInfo> files;

  /** Information for a single conflicted file. */
  public static class ConflictFileInfo {
    /** Repository relative file path. */
    public String path;

    /** Content from the common base side. */
    public String baseContent;

    /** Content from the current side. */
    public String currentContent;

    /** Content from the incoming side. */
    public String incomingContent;

    /**
     * Precomputed initial resolved content used in the editable bottom pane.
     *
     * <p>Servers may populate this with a default merge result and allow clients to modify it.
     */
    public String resolvedContent;
  }
}
