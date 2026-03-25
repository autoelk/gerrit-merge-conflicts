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

/** Input for publishing conflict resolutions from a three-way merge UI. */
public class PublishThreeWayMergeConflictsInput {
  /** Whether resolved content should be persisted as a change edit instead of a new patch set. */
  public Boolean publishAsChangeEdit;

  /** Per-file conflict resolutions to apply. */
  public List<FileResolutionInput> fileResolutions;

  /** Resolution payload for a single file. */
  public static class FileResolutionInput {
    /** Repository relative file path for the conflicted file. */
    public String path;

    /** Indicates which source was selected for the resolution if no manual edit was used. */
    public ResolutionSource resolutionSource;

    /** Optional manual content from the editable bottom pane. */
    public String resolvedContent;
  }

  /** Source that should be used as resolution when not manually editing content. */
  public enum ResolutionSource {
    BASE,
    CURRENT,
    INCOMING,
    MANUAL
  }
}
